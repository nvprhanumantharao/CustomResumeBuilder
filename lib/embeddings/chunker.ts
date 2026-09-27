/**
 * Candidate evidence chunking.
 *
 * Converts a CareerProfile into discrete, metadata-rich chunks that can be
 * embedded and retrieved independently.  Every chunk carries provenance so
 * that any generated resume statement can be traced back to its source.
 *
 * Chunk types mirror EvidenceKind from profile/types.ts:
 *   contact | summary | employment | achievement | project | skill |
 *   certification | education
 *
 * Each chunk also carries:
 *   - candidateId  (required for cross-candidate isolation)
 *   - evidenceId   (the stable profile-level id)
 *   - source       ("resume")
 *   - verificationStatus ("verified" for human-provided data; see note below)
 *
 * NOTE: In this architecture all data is directly entered/edited by the
 * candidate, so everything is treated as "verified".  A future backend could
 * introduce a separate verification workflow and pass that status here.
 */

import type { CareerProfile, EvidenceKind } from "../profile/types";
import { collectEvidence } from "../profile/evidence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceChunk {
  /** Globally unique chunk id (evidence id from the profile). */
  id: string;
  /** Candidate identifier — used to enforce cross-candidate isolation. */
  candidateId: string;
  kind: EvidenceKind;
  /** The raw text content to embed. */
  content: string;
  /** Human-readable label (used in logging / UI). */
  label: string;
  /** Source document type (always "resume" in this single-source architecture). */
  source: "resume";
  /** Whether the candidate explicitly verified this item. */
  verificationStatus: "verified" | "unverified";
  /** Pre-computed embedding vector (populated after embedBatch is called). */
  embedding?: number[];
}

// ---------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------

/**
 * Converts a CareerProfile into EvidenceChunks ready for embedding.
 *
 * Uses the existing `collectEvidence` function to ensure consistent evidence
 * collection logic across the codebase.
 *
 * @param profile     The candidate's career profile.
 * @param candidateId An opaque identifier for the candidate (e.g. a session id
 *                    or email hash).  Used to scope vector retrieval so that
 *                    candidate A never retrieves candidate B's evidence.
 */
export function chunkProfile(profile: CareerProfile, candidateId: string): EvidenceChunk[] {
  const refs = collectEvidence(profile);
  return refs
    .filter((ref) => ref.quote.trim().length > 0)
    .map((ref) => ({
      id: ref.id,
      candidateId,
      kind: ref.kind,
      content: ref.quote,
      label: ref.label,
      source: "resume" as const,
      verificationStatus: "verified" as const,
    }));
}

/**
 * Produces a map from evidence id → EvidenceChunk for O(1) lookup during
 * retrieval scoring.
 */
export function chunkMapOf(chunks: EvidenceChunk[]): Map<string, EvidenceChunk> {
  return new Map(chunks.map((chunk) => [chunk.id, chunk]));
}
