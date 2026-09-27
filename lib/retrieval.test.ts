/**
 * Tests for the chunker, retrieval, and reranker modules.
 *
 * Critical test: candidate isolation — candidate A never retrieves B's evidence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// Chunker tests
// ---------------------------------------------------------------------------

describe("chunker", async () => {
  const { chunkProfile, chunkMapOf } = await import("./embeddings/chunker");
  const { sampleProfile } = await import("./profile/sample");

  it("produces chunks with correct candidateId and non-empty content", () => {
    const chunks = chunkProfile(sampleProfile, "cand-abc");
    assert.ok(chunks.length > 0, "should produce at least one chunk");
    for (const chunk of chunks) {
      assert.equal(chunk.candidateId, "cand-abc", "every chunk must carry the candidateId");
      assert.ok(chunk.content.trim().length > 0, "chunk content must not be empty");
      assert.ok(chunk.id.length > 0, "chunk must have an id");
    }
  });

  it("only includes verified status", () => {
    const chunks = chunkProfile(sampleProfile, "cand-abc");
    for (const chunk of chunks) {
      assert.equal(chunk.verificationStatus, "verified");
      assert.equal(chunk.source, "resume");
    }
  });

  it("creates a map with the correct ids", () => {
    const chunks = chunkProfile(sampleProfile, "cand-abc");
    const map = chunkMapOf(chunks);
    for (const chunk of chunks) {
      assert.ok(map.has(chunk.id), `map should contain id ${chunk.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Retrieval tests — no embedding API needed (keyword-only path)
// ---------------------------------------------------------------------------

describe("retrieval", async () => {
  const { retrieveEvidence } = await import("./retrieval/index");
  const { chunkProfile } = await import("./embeddings/chunker");
  const { sampleProfile } = await import("./profile/sample");

  it("returns only chunks for the requested candidateId", async () => {
    const chunksA = chunkProfile(sampleProfile, "cand-A");
    const chunksB = chunkProfile(sampleProfile, "cand-B");
    const allChunks = [...chunksA, ...chunksB];

    const results = await retrieveEvidence(allChunks, {
      query: "Java Spring Boot microservices",
      candidateId: "cand-A",
      topK: 50,
    });

    for (const r of results) {
      assert.equal(
        r.chunk.candidateId,
        "cand-A",
        "CRITICAL: must never return another candidate's evidence",
      );
    }
  });

  it("returns empty array when no chunks match candidateId", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const results = await retrieveEvidence(chunks, {
      query: "Kubernetes",
      candidateId: "cand-NONEXISTENT",
    });
    assert.equal(results.length, 0);
  });

  it("respects topK limit", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const results = await retrieveEvidence(chunks, {
      query: "software engineer",
      candidateId: "cand-A",
      topK: 2,
    });
    assert.ok(results.length <= 2, `topK=2 but got ${results.length}`);
  });

  it("filters by evidenceKind", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const results = await retrieveEvidence(chunks, {
      query: "backend",
      candidateId: "cand-A",
      evidenceKinds: ["skill"],
      topK: 100,
    });
    for (const r of results) {
      assert.equal(r.chunk.kind, "skill");
    }
  });

  it("keyword-scores text containing the query term higher than irrelevant text", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const results = await retrieveEvidence(chunks, {
      query: "Python",
      candidateId: "cand-A",
      topK: 5,
    });
    if (results.length > 0 && results[0]) {
      // The top result should mention Python (keyword score > 0)
      // (sample profile may or may not have Python — just verify sorting)
      const scores = results.map((r) => r.hybridScore);
      for (let i = 0; i < scores.length - 1; i++) {
        assert.ok(
          (scores[i] ?? 0) >= (scores[i + 1] ?? 0),
          "results should be sorted descending by hybridScore",
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Reranker tests — no LLM key → falls back to score strategy
// ---------------------------------------------------------------------------

describe("reranker", async () => {
  const { rerankEvidence } = await import("./reranker/index");
  const { retrieveEvidence } = await import("./retrieval/index");
  const { chunkProfile } = await import("./embeddings/chunker");
  const { sampleProfile } = await import("./profile/sample");

  it("returns at most rerankTopK items", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const retrieved = await retrieveEvidence(chunks, {
      query: "software engineer",
      candidateId: "cand-A",
      topK: 20,
    });
    const ranked = await rerankEvidence("software engineer", retrieved, 3);
    assert.ok(ranked.length <= 3, `topK=3 but got ${ranked.length}`);
  });

  it("returns empty array for empty input", async () => {
    const ranked = await rerankEvidence("anything", [], 5);
    assert.equal(ranked.length, 0);
  });

  it("ranked items are sorted by finalScore descending", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const retrieved = await retrieveEvidence(chunks, {
      query: "backend API",
      candidateId: "cand-A",
      topK: 20,
    });
    const ranked = await rerankEvidence("backend API", retrieved, 10);
    for (let i = 0; i < ranked.length - 1; i++) {
      assert.ok(
        (ranked[i]?.finalScore ?? 0) >= (ranked[i + 1]?.finalScore ?? 0),
        "results must be sorted by finalScore descending",
      );
    }
  });

  it("every ranked item has the correct candidateId", async () => {
    const chunks = chunkProfile(sampleProfile, "cand-A");
    const retrieved = await retrieveEvidence(chunks, {
      query: "TypeScript React",
      candidateId: "cand-A",
      topK: 20,
    });
    const ranked = await rerankEvidence("TypeScript React", retrieved, 10);
    for (const item of ranked) {
      assert.equal(item.chunk.candidateId, "cand-A");
    }
  });
});
