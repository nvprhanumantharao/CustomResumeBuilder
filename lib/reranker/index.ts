/**
 * Reranker — selects the most relevant evidence after initial retrieval.
 *
 * Pipeline:
 *   JD requirement
 *     → vector retrieval (top 20–50 candidates)
 *     → Reranker
 *     → top 5–10 evidence items
 *
 * Strategy (configurable via AI_RERANKER_PROVIDER):
 *
 *   "llm"   — LLM-based reranking using a structured scoring prompt.
 *             Scores semantic relevance, skill match, responsibility match,
 *             seniority, domain, and exact technology match (0–10 each).
 *             Falls back to "score" if the LLM call fails.
 *
 *   "score" — Weighted hybrid score already computed during retrieval.
 *             No additional API call; instant.
 *
 * The "llm" strategy is more accurate but costs one LLM call per rerank
 * invocation.  The number of candidates sent to the LLM is bounded by
 * AI_RETRIEVAL_TOP_K (default 20) to keep token usage predictable.
 */

import { z } from "zod";
import { callLLMStructured } from "../llm/provider";
import type { RetrievedEvidence } from "../retrieval/index";
import { rerankTopK, rerankerProvider } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RankedEvidence {
  chunk: RetrievedEvidence["chunk"];
  semanticScore: number;
  keywordScore: number;
  hybridScore: number;
  /** Reranker-assigned relevance score (0–10). -1 when not reranked. */
  rerankScore: number;
  /** Combined final score (used for the final sort). */
  finalScore: number;
}

// ---------------------------------------------------------------------------
// LLM reranking schema
// ---------------------------------------------------------------------------

const rerankItemSchema = z.object({
  evidenceId: z.string(),
  /**
   * Composite relevance score 0–10.
   * 10 = perfectly supports the JD requirement;  0 = entirely unrelated.
   */
  relevanceScore: z.number().min(0).max(10),
  reason: z.string(),
});

const rerankResponseSchema = z.object({
  scores: z.array(rerankItemSchema),
});

// ---------------------------------------------------------------------------
// LLM-based reranker
// ---------------------------------------------------------------------------

async function rerankWithLLM(
  query: string,
  candidates: RetrievedEvidence[],
): Promise<Map<string, number>> {
  const scoreMap = new Map<string, number>();

  // Build compact evidence list for the prompt (no PII beyond what is in the
  // evidence itself; JD is treated as untrusted but used only for scoring).
  const evidenceList = candidates.map((item) => ({
    id: item.chunk.id,
    kind: item.chunk.kind,
    text: item.chunk.content.slice(0, 400), // Truncate to control token cost
  }));

  const result = await callLLMStructured(
    rerankResponseSchema,
    [
      "You are a resume relevance scorer.",
      "Given a job requirement and a list of candidate evidence items, score each item",
      "from 0 to 10 based on how strongly it supports the requirement.",
      "Consider: semantic relevance, skill match, responsibility match, seniority,",
      "domain alignment, and exact technology match.",
      "Return a JSON object with a 'scores' array. Include an entry for every evidenceId provided.",
      "Never invent evidence items.",
    ].join(" "),
    JSON.stringify({ requirement: query, evidence: evidenceList }),
  );

  if (!result) return scoreMap;

  for (const item of result.scores) {
    scoreMap.set(item.evidenceId, item.relevanceScore);
  }

  console.log(
    `[reranker] LLM reranked ${result.scores.length}/${candidates.length} items for query "${query.slice(0, 60)}"`,
  );

  return scoreMap;
}

// ---------------------------------------------------------------------------
// Public reranker
// ---------------------------------------------------------------------------

/**
 * Reranks retrieved evidence and returns the top-K most relevant items.
 *
 * @param query       The JD requirement text (used as context for LLM scoring).
 * @param candidates  Retrieved evidence from the retrieval stage.
 * @param topK        How many to keep (defaults to AI_RERANK_TOP_K).
 */
export async function rerankEvidence(
  query: string,
  candidates: RetrievedEvidence[],
  topK: number = rerankTopK(),
): Promise<RankedEvidence[]> {
  if (candidates.length === 0) return [];

  const provider = rerankerProvider();
  let llmScores = new Map<string, number>();

  if (provider === "llm") {
    try {
      llmScores = await rerankWithLLM(query, candidates);
    } catch (error) {
      console.error(
        "[reranker] LLM reranking failed; falling back to hybrid score.",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const ranked: RankedEvidence[] = candidates.map((item) => {
    const rerankScore = llmScores.get(item.chunk.id) ?? -1;
    // When LLM score is available: 60% LLM relevance (normalised 0–1) + 40% hybrid retrieval score.
    // When LLM score is absent: use hybrid score alone.
    const finalScore =
      rerankScore >= 0
        ? (rerankScore / 10) * 0.6 + Math.max(item.hybridScore, 0) * 0.4
        : Math.max(item.hybridScore, 0);

    return {
      chunk: item.chunk,
      semanticScore: item.semanticScore,
      keywordScore: item.keywordScore,
      hybridScore: item.hybridScore,
      rerankScore,
      finalScore,
    };
  });

  const results = ranked.sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);

  console.log(
    `[reranker] Selected top ${results.length} from ${candidates.length} candidates ` +
      `(provider=${provider} llm=${llmScores.size > 0})`,
  );

  return results;
}
