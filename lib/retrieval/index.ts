/**
 * Semantic + hybrid retrieval.
 *
 * Retrieves the most relevant candidate evidence chunks for a given JD
 * requirement query using a combination of:
 *
 *   1. Vector cosine similarity (semantic)  — powered by the embedding service
 *   2. Keyword / metadata filtering         — exact term matching (existing lib)
 *   3. Candidate isolation                  — never returns another candidate's evidence
 *
 * The two signals are combined into a hybrid score before returning the top-K
 * results.  The reranker stage further narrows these to the final set used
 * for resume generation.
 *
 * When embeddings are unavailable (no API key) the retrieval falls back to
 * pure keyword scoring, which is how the existing matchProfile() already works.
 */

import { embedBatch, embedText, cosineSimilarity } from "../embeddings/index";
import type { EvidenceChunk } from "../embeddings/chunker";
import { termMentioned } from "../text";
import { retrievalTopK } from "../config";
import type { EvidenceKind } from "../profile/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  /** The JD requirement text to match against (e.g. "distributed Java microservices"). */
  query: string;
  /** The candidate whose evidence should be searched. Required. */
  candidateId: string;
  /** Maximum number of results to return (defaults to AI_RETRIEVAL_TOP_K). */
  topK?: number;
  /** Minimum cosine similarity threshold (0–1). Evidence below this is discarded. */
  minimumSimilarity?: number;
  /** Restrict results to specific evidence kinds. */
  evidenceKinds?: EvidenceKind[];
  /** If true, only return chunks with verificationStatus === "verified". */
  verifiedOnly?: boolean;
}

export interface RetrievedEvidence {
  chunk: EvidenceChunk;
  /** Cosine similarity score (0–1). -1 when embeddings were unavailable. */
  semanticScore: number;
  /** Keyword overlap score (0+). */
  keywordScore: number;
  /** Combined hybrid score used for ranking (semantic * 0.7 + keyword * 0.3). */
  hybridScore: number;
}

// ---------------------------------------------------------------------------
// Keyword scoring helper
// ---------------------------------------------------------------------------

function keywordScore(text: string, query: string): number {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return 0;
  const hits = words.filter((word) => termMentioned(text, word));
  return hits.length / words.length;
}

// ---------------------------------------------------------------------------
// Core retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieves the most relevant candidate evidence for a JD query.
 *
 * Critical guarantee: results are always scoped to the provided candidateId.
 * Cross-candidate retrieval is architecturally impossible — chunks are filtered
 * by candidateId before any scoring.
 *
 * @param chunks  All embedded evidence chunks for the candidate.  Must have
 *                been processed by embedCandidateChunks() first (or will
 *                fall back to keyword-only if embeddings are absent).
 * @param query   A retrieval query.
 */
export async function retrieveEvidence(
  chunks: EvidenceChunk[],
  query: RetrievalQuery,
): Promise<RetrievedEvidence[]> {
  const {
    query: queryText,
    candidateId,
    topK = retrievalTopK(),
    minimumSimilarity = 0,
    evidenceKinds,
    verifiedOnly = false,
  } = query;

  // ── 1. Candidate isolation ──────────────────────────────────────────────
  let candidates = chunks.filter((c) => c.candidateId === candidateId);

  // ── 2. Metadata filtering ───────────────────────────────────────────────
  if (evidenceKinds && evidenceKinds.length > 0) {
    candidates = candidates.filter((c) => evidenceKinds.includes(c.kind));
  }
  if (verifiedOnly) {
    candidates = candidates.filter((c) => c.verificationStatus === "verified");
  }

  if (candidates.length === 0) {
    console.log(`[retrieval] No candidate chunks after filtering (candidateId=${candidateId}).`);
    return [];
  }

  // ── 3. Embed the query ──────────────────────────────────────────────────
  const queryEmbedding = await embedText(queryText);

  // ── 4. Score each chunk ─────────────────────────────────────────────────
  const scored: RetrievedEvidence[] = candidates.map((chunk) => {
    const semantic =
      queryEmbedding && chunk.embedding
        ? cosineSimilarity(queryEmbedding, chunk.embedding)
        : -1; // -1 signals "no embedding available"

    const keyword = keywordScore(chunk.content, queryText);

    // Hybrid: 70% semantic, 30% keyword.  When no embeddings available,
    // fall back to pure keyword.
    const hybrid =
      semantic >= 0 ? semantic * 0.7 + keyword * 0.3 : keyword;

    return { chunk, semanticScore: semantic, keywordScore: keyword, hybridScore: hybrid };
  });

  // ── 5. Filter by minimum similarity ────────────────────────────────────
  const filtered =
    minimumSimilarity > 0
      ? scored.filter(
          (item) =>
            item.semanticScore < 0 || // no embedding → don't filter out
            item.semanticScore >= minimumSimilarity,
        )
      : scored;

  // ── 6. Sort + top-K ─────────────────────────────────────────────────────
  const results = filtered
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK);

  console.log(
    `[retrieval] Query matched ${results.length}/${candidates.length} chunks ` +
      `(topK=${topK} candidateId=${candidateId} semantic=${queryEmbedding ? "yes" : "no"})`,
  );

  return results;
}

// ---------------------------------------------------------------------------
// Batch embed chunks (call before retrieval to populate chunk.embedding)
// ---------------------------------------------------------------------------

/**
 * Populates the `embedding` field on each chunk by calling the embedding
 * service in batch mode.
 *
 * Chunks that already have an embedding are skipped (idempotent).
 * Returns the same array with embeddings filled in (mutates in-place).
 */
export async function embedCandidateChunks(chunks: EvidenceChunk[]): Promise<EvidenceChunk[]> {
  const unembedded = chunks.filter((c) => !c.embedding);
  if (unembedded.length === 0) return chunks;

  const texts = unembedded.map((c) => c.content);
  const embeddings = await embedBatch(texts);

  for (let i = 0; i < unembedded.length; i++) {
    const vec = embeddings[i];
    if (vec) unembedded[i]!.embedding = vec;
  }

  return chunks;
}
