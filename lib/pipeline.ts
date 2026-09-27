/**
 * AI/RAG Orchestration Pipeline.
 *
 * Implements the complete evidence-backed resume generation pipeline:
 *
 *   Load Candidate Profile
 *     ↓
 *   Analyze Job Description
 *     ↓
 *   Extract Requirements
 *     ↓
 *   Chunk & Embed Candidate Evidence
 *     ↓
 *   Retrieve Relevant Evidence (semantic + keyword)
 *     ↓
 *   Rerank Evidence
 *     ↓
 *   Generate Resume (LLM rewrite)
 *     ↓
 *   Fact Validation (deterministic + semantic LLM)
 *     ↓  (if invalid)
 *   Regenerate (up to AI_MAX_REGENERATION_ATTEMPTS)
 *     ↓
 *   Final Resume
 *
 * This pipeline integrates with the existing API routes.  The routes call
 * runPipeline() instead of calling individual functions separately.
 *
 * Existing functions (generateResume, matchProfile, rewriteWithModel) are
 * reused and not replaced.  The pipeline adds the embedding, retrieval,
 * reranking, and semantic validation stages.
 *
 * Candidate isolation guarantee:
 *   The candidateId parameter is derived from the session / profile inside
 *   this file and is used throughout retrieval to prevent cross-candidate
 *   evidence leakage.  In this localStorage architecture, each browser tab
 *   is its own "candidate"; the candidateId is derived from a hash of the
 *   profile's name + email to create a stable, non-secret scoping key.
 */

import type { CareerProfile } from "./profile/types";
import type { JdAnalysis } from "./jd/types";
import type { MatchResult } from "./match/score";
import { matchProfile } from "./match/score";
import { generateResume } from "./resume/generate";
import { validateResumeDocument } from "./resume/validate";
import type { ResumeDocument } from "./resume/types";
import { rewriteWithModel, type RewriteHints } from "./llm/index";
import { chunkProfile, chunkMapOf } from "./embeddings/chunker";
import { embedCandidateChunks } from "./retrieval/index";
import { retrieveEvidence } from "./retrieval/index";
import { rerankEvidence } from "./reranker/index";
import {
  semanticValidate,
  extractResumeLinesForValidation,
} from "./resume/semantic-validate";
import { collectEvidence } from "./profile/evidence";
import { maxRegenerationAttempts } from "./config";
import type { SemanticValidationResult } from "./resume/semantic-validate";
import type { RankedEvidence } from "./reranker/index";

// ---------------------------------------------------------------------------
// Candidate ID
// ---------------------------------------------------------------------------

/**
 * Derives a stable, non-secret candidate scoping key from the profile.
 * Used to isolate vector retrieval to the correct candidate.
 *
 * Not a cryptographic identity — purely for namespacing within a session.
 */
function deriveCandidateId(profile: CareerProfile): string {
  const raw = `${profile.name.trim().toLowerCase()}::${profile.email.trim().toLowerCase()}`;
  // Simple hash — good enough for scoping, not for security
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `cand-${hash.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Pipeline result types
// ---------------------------------------------------------------------------

export interface PipelineRetrievalResult {
  /** Top retrieved and reranked evidence items (with scores). */
  rankedEvidence: RankedEvidence[];
  /** Whether semantic embeddings were used (false = keyword-only fallback). */
  semanticEnabled: boolean;
}

export interface PipelineValidationResult {
  /** Result of the deterministic + semantic validation pass. */
  semantic: SemanticValidationResult;
  /** Lines that were dropped by the deterministic validator. */
  dropped: ResumeDocument["validation"]["dropped"];
}

export interface PipelineResult {
  resume: ResumeDocument;
  match: MatchResult;
  retrieval: PipelineRetrievalResult;
  validation: PipelineValidationResult;
  /** Number of generation attempts made (1 = first pass succeeded). */
  generationAttempts: number;
  mode: ResumeDocument["mode"];
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the complete AI/RAG pipeline for a single profile + JD pair.
 *
 * @param profile   The candidate's career profile (human-provided, verified).
 * @param analysis  The parsed JD analysis.
 *
 * Returns a fully validated ResumeDocument along with retrieval / validation
 * metadata for transparency.
 */
export async function runPipeline(
  profile: CareerProfile,
  analysis: JdAnalysis,
): Promise<PipelineResult> {
  const candidateId = deriveCandidateId(profile);

  // ── Step 1: Keyword match (always runs) ────────────────────────────────
  const match = matchProfile(profile, analysis);

  // ── Step 2: Chunk candidate evidence ───────────────────────────────────
  let chunks = chunkProfile(profile, candidateId);

  // ── Step 3: Embed chunks (no-op if no embedding key) ───────────────────
  chunks = await embedCandidateChunks(chunks);
  const semanticEnabled = chunks.some((c) => Boolean(c.embedding));

  // ── Step 4: Retrieve relevant evidence per JD requirement ──────────────
  // We retrieve once per requirement and aggregate for the full job.
  // The primary query is the union of required skills and responsibilities.
  const requirementQueries = [
    ...analysis.requiredSkills,
    ...analysis.preferredSkills.slice(0, 5), // cap to keep token cost manageable
    ...analysis.responsibilities.slice(0, 5),
  ].filter(Boolean);

  // Use a single composite query for top-K retrieval (simpler, fewer API calls)
  const compositeQuery = requirementQueries.slice(0, 10).join(". ");
  const retrieved = compositeQuery.trim()
    ? await retrieveEvidence(chunks, {
        query: compositeQuery,
        candidateId, // ← enforces cross-candidate isolation
        topK: Math.min(chunks.length, 30),
      })
    : [];

  // ── Step 5: Rerank ─────────────────────────────────────────────────────
  const ranked = await rerankEvidence(compositeQuery, retrieved);

  const retrieval: PipelineRetrievalResult = {
    rankedEvidence: ranked,
    semanticEnabled,
  };

  // ── Step 6: Generate resume (with LLM rewrite) ─────────────────────────
  const evidenceById = new Map(
    collectEvidence(profile).map((ref) => [ref.id, ref]),
  );
  const evidenceIds = ranked.map((item) => item.chunk.id);

  let generationAttempts = 0;
  const maxAttempts = maxRegenerationAttempts() + 1;
  let rejectedClaims: string[] = [];

  const draft = async (hints: RewriteHints) => {
    const rewrite = await rewriteWithModel(profile, analysis, match, hints);
    return generateResume(
      profile,
      analysis,
      match,
      rewrite,
      rewrite ? "openai" : "heuristic",
    );
  };

  let resume = await draft({ evidenceIds, rejectedClaims });
  generationAttempts++;

  // ── Step 7: Semantic validation + regeneration loop ────────────────────
  let semanticResult: SemanticValidationResult = { valid: true, claims: [] };

  while (generationAttempts <= maxAttempts) {
    const linesToValidate = extractResumeLinesForValidation(resume);

    if (linesToValidate.length > 0) {
      semanticResult = await semanticValidate(linesToValidate, evidenceById);
    }

    if (semanticResult.valid) break;

    if (generationAttempts >= maxAttempts) {
      console.warn(
        `[pipeline] Semantic validation still found issues after ${generationAttempts} attempt(s). Using best available result.`,
      );
      break;
    }

    rejectedClaims = semanticResult.claims
      .filter((claim) => claim.status === "UNSUPPORTED")
      .map((claim) => claim.claim);
    console.log(
      `[pipeline] Regenerating (attempt ${generationAttempts + 1}/${maxAttempts})…`,
    );
    resume = await draft({ evidenceIds, rejectedClaims });
    generationAttempts++;
  }

  // ── Step 8: Final deterministic validation pass ─────────────────────────
  // validateResumeDocument removes any lines that still violate the rules.
  const validated = validateResumeDocument(resume, profile);

  const validation: PipelineValidationResult = {
    semantic: semanticResult,
    dropped: validated.validation.dropped,
  };

  return {
    resume: validated,
    match,
    retrieval,
    validation,
    generationAttempts,
    mode: validated.mode,
  };
}
