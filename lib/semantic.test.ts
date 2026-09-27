/**
 * Tests for:
 *   - lib/resume/semantic-validate.ts (deterministic helpers, null-LLM fallback)
 *   - lib/match/score.ts (sub-score fields)
 *
 * The LLM path is exercised in the null-key fallback scenario only, so no
 * API credentials are needed.  The structured claim status tests (SUPPORTED,
 * UNSUPPORTED, etc.) are validated through the deterministic validator, which
 * already has comprehensive coverage in lib/unit.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// Semantic validator — null-LLM fallback behaviour
// ---------------------------------------------------------------------------

describe("semantic validator — extractResumeLinesForValidation", async () => {
  const { extractResumeLinesForValidation } = await import("./resume/semantic-validate");

  it("includes non-empty summary and bullet lines with evidence", () => {
    const resume = {
      summary: { text: "Experienced engineer.", evidenceIds: ["s1"] },
      skills: [],
      experience: [
        {
          bullets: [
            { text: "Built APIs.", evidenceIds: ["b1"] },
            { text: "  ", evidenceIds: ["b2"] },   // empty → excluded
            { text: "Deployed services.", evidenceIds: [] }, // no evidence → excluded
          ],
        },
      ],
    };
    const lines = extractResumeLinesForValidation(resume);
    assert.equal(lines.length, 2, "Only non-empty lines with evidence IDs should be included");
    assert.equal(lines[0]?.section, "summary");
    assert.equal(lines[0]?.text, "Experienced engineer.");
    assert.equal(lines[1]?.section, "experience");
    assert.equal(lines[1]?.text, "Built APIs.");
  });

  it("returns empty array when all lines are empty", () => {
    const resume = {
      summary: { text: "", evidenceIds: [] },
      skills: [],
      experience: [],
    };
    const lines = extractResumeLinesForValidation(resume);
    assert.equal(lines.length, 0);
  });

  it("handles multiple roles", () => {
    const resume = {
      summary: { text: "", evidenceIds: [] },
      skills: [],
      experience: [
        { bullets: [{ text: "Led team.", evidenceIds: ["b1"] }] },
        { bullets: [{ text: "Built APIs.", evidenceIds: ["b2"] }] },
      ],
    };
    const lines = extractResumeLinesForValidation(resume);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.section === "experience"));
  });
});

// ---------------------------------------------------------------------------
// Semantic validator — no-LLM behaviour (null key)
// ---------------------------------------------------------------------------

describe("semantic validator — null-LLM fallback", async () => {
  const { semanticValidate } = await import("./resume/semantic-validate");
  const { sampleProfile } = await import("./profile/sample");
  const { collectEvidence } = await import("./profile/evidence");

  const evidence = collectEvidence(sampleProfile);
  const evidenceById = new Map(evidence.map((ref) => [ref.id, ref]));

  it("returns valid:true and REQUIRES_REVIEW when no evidence is cited", async () => {
    // Lines with evidence IDs that are not in the evidenceById map →
    // evidenceContext will be empty → nullResult is returned
    const lines = [{ text: "Built Spring Boot APIs", evidenceIds: ["nonexistent-id"] }];
    const result = await semanticValidate(lines, evidenceById);
    assert.equal(result.valid, true);
    assert.equal(result.claims[0]?.status, "REQUIRES_REVIEW");
  });

  it("returns empty claims for empty input", async () => {
    const result = await semanticValidate([], evidenceById);
    assert.equal(result.valid, true);
    assert.equal(result.claims.length, 0);
  });

  it("returns REQUIRES_REVIEW claims when LLM result is null (no key)", async () => {
    // When OPENAI_API_KEY is absent, callLLMStructured returns null → nullResult
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const ref = evidence[0];
    if (!ref) {
      if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
      return;
    }
    const lines = [{ text: "Built something", evidenceIds: [ref.id] }];
    const result = await semanticValidate(lines, evidenceById);
    // When LLM returns null (no key), status is REQUIRES_REVIEW and valid=true
    assert.equal(result.valid, true);
    assert.ok(
      result.claims.every((c) => c.status === "REQUIRES_REVIEW"),
      "All claims should be REQUIRES_REVIEW when LLM is unavailable",
    );

    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  });
});

// ---------------------------------------------------------------------------
// Match sub-scores
// ---------------------------------------------------------------------------

describe("match sub-scores", async () => {
  const { matchProfile } = await import("./match/score");
  const { sampleProfile } = await import("./profile/sample");
  const { analyzeJobHeuristic } = await import("./jd/analyze");
  const { sampleJobDescription } = await import("./jd/sample");

  it("returns subScores with all required fields", () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);

    assert.ok("subScores" in match, "subScores must be present");
    assert.ok(typeof match.subScores.overallScore === "number");
    assert.ok(typeof match.subScores.skillsMatch === "number");
    assert.ok(typeof match.subScores.experienceMatch === "number");
    assert.ok(typeof match.subScores.domainMatch === "number");
    assert.ok(Array.isArray(match.subScores.matchedRequirements));
    assert.ok(Array.isArray(match.subScores.missingRequirements));
  });

  it("subScores.overallScore equals top-level score", () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    assert.equal(match.subScores.overallScore, match.score);
  });

  it("sub-scores are in range 0–100", () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const { skillsMatch, experienceMatch, domainMatch } = match.subScores;
    assert.ok(skillsMatch >= 0 && skillsMatch <= 100, `skillsMatch=${skillsMatch}`);
    assert.ok(experienceMatch >= 0 && experienceMatch <= 100, `experienceMatch=${experienceMatch}`);
    assert.ok(domainMatch >= 0 && domainMatch <= 100, `domainMatch=${domainMatch}`);
  });

  it("missingRequirements matches gaps array", () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const gapRequirements = match.gaps.map((g) => g.requirement).sort();
    assert.deepEqual(match.subScores.missingRequirements.slice().sort(), gapRequirements);
  });

  it("experienceMatch is 100 when JD has no required skills", () => {
    const analysis = {
      title: "Designer",
      seniority: "",
      domain: "",
      requiredSkills: [],
      preferredSkills: [],
      responsibilities: [],
      keywords: [],
    };
    const match = matchProfile(sampleProfile, analysis);
    assert.equal(match.subScores.experienceMatch, 100);
  });

  it("domainMatch is 100 when JD has no meaningful keywords", () => {
    const analysis = {
      title: "Role",
      seniority: "",
      domain: "",
      requiredSkills: [],
      preferredSkills: [],
      responsibilities: [],
      keywords: ["a", "in"], // all too short (< 4 chars) → meaningfulKeywords is empty
    };
    const match = matchProfile(sampleProfile, analysis);
    assert.equal(match.subScores.domainMatch, 100);
  });

  it("Test 5 — missing JD skill Kubernetes stays as a gap", () => {
    const analysis = {
      title: "DevOps Engineer",
      seniority: "Senior",
      domain: "DevOps",
      requiredSkills: ["Kubernetes"],
      preferredSkills: [],
      responsibilities: [],
      keywords: ["Kubernetes"],
    };
    // Use a profile with no Kubernetes evidence
    const profile = { ...sampleProfile, skills: [] };
    const match = matchProfile(profile, analysis);
    assert.ok(
      match.gaps.some((g) => g.requirement === "Kubernetes"),
      "Kubernetes must appear as a gap — not written into the resume",
    );
    assert.ok(
      match.subScores.missingRequirements.includes("Kubernetes"),
      "missingRequirements must list Kubernetes",
    );
    assert.equal(match.score, 0, "score should be 0 when no requirements are covered");
  });
});
