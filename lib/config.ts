/**
 * Centralised runtime configuration.
 *
 * All AI-related settings are read from environment variables so that no
 * credentials or model names are hard-coded.  Defaults are deliberately
 * conservative (smallest / cheapest options) to keep the app functional out of
 * the box when only OPENAI_API_KEY is supplied.
 */

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

/** Which LLM provider to use: "openai" | "anthropic" | "google" */
export function llmProvider(): string {
  return (process.env.AI_LLM_PROVIDER ?? "openai").trim().toLowerCase();
}

export function llmModel(): string {
  // Provider-specific env var wins; generic AI_LLM_MODEL is the fallback.
  if (llmProvider() === "openai") {
    return (process.env.OPENAI_MODEL ?? process.env.AI_LLM_MODEL ?? "gpt-4o-mini").trim();
  }
  if (llmProvider() === "anthropic") {
    return (process.env.AI_LLM_MODEL ?? "claude-3-haiku-20240307").trim();
  }
  if (llmProvider() === "google") {
    return (process.env.AI_LLM_MODEL ?? "gemini-1.5-flash").trim();
  }
  return (process.env.AI_LLM_MODEL ?? "gpt-4o-mini").trim();
}

export function llmTemperature(): number {
  const raw = process.env.AI_LLM_TEMPERATURE;
  if (!raw) return 0.1;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0.1;
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

/** Which embedding provider to use: "openai" | "google" */
export function embeddingProvider(): string {
  return (process.env.AI_EMBEDDING_PROVIDER ?? llmProvider()).trim().toLowerCase();
}

export function embeddingModel(): string {
  if (embeddingProvider() === "openai") {
    return (process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small").trim();
  }
  if (embeddingProvider() === "google") {
    return (process.env.AI_EMBEDDING_MODEL ?? "text-embedding-004").trim();
  }
  return (process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small").trim();
}

/** Dimensionality of the chosen model's output vectors (used for cosine similarity). */
export function embeddingDimension(): number {
  // text-embedding-3-small → 1536, text-embedding-3-large → 3072
  // text-embedding-004 (Google) → 768
  const raw = process.env.AI_EMBEDDING_DIMENSION;
  if (raw) {
    const n = parseInt(raw, 10);
    if (n > 0) return n;
  }
  const model = embeddingModel();
  if (model.includes("large")) return 3072;
  if (model === "text-embedding-004") return 768;
  return 1536;
}

// ---------------------------------------------------------------------------
// Reranker
// ---------------------------------------------------------------------------

/** Which reranker strategy to use: "llm" | "score" */
export function rerankerProvider(): string {
  return (process.env.AI_RERANKER_PROVIDER ?? "llm").trim().toLowerCase();
}

export function retrievalTopK(): number {
  const raw = process.env.AI_RETRIEVAL_TOP_K;
  if (!raw) return 20;
  const n = parseInt(raw, 10);
  return n > 0 ? n : 20;
}

export function rerankTopK(): number {
  const raw = process.env.AI_RERANK_TOP_K;
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return n > 0 ? n : 5;
}

// ---------------------------------------------------------------------------
// Validation / generation
// ---------------------------------------------------------------------------

export function maxRegenerationAttempts(): number {
  const raw = process.env.AI_MAX_REGENERATION_ATTEMPTS;
  if (!raw) return 2;
  const n = parseInt(raw, 10);
  return n >= 0 ? n : 2;
}

// ---------------------------------------------------------------------------
// API key helpers
// ---------------------------------------------------------------------------

export function openAIKey(): string {
  return (process.env.OPENAI_API_KEY ?? "").trim();
}

export function anthropicKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export function googleAIKey(): string {
  return (process.env.GOOGLE_AI_API_KEY ?? "").trim();
}

export function hasLLMKey(): boolean {
  const p = llmProvider();
  if (p === "openai") return Boolean(openAIKey());
  if (p === "anthropic") return Boolean(anthropicKey());
  if (p === "google") return Boolean(googleAIKey());
  return false;
}

export function hasEmbeddingKey(): boolean {
  const p = embeddingProvider();
  if (p === "openai") return Boolean(openAIKey());
  if (p === "google") return Boolean(googleAIKey());
  return false;
}
