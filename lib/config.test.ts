/**
 * Tests for the config module.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const savedEnv: Record<string, string | undefined> = {};
const KEYS = [
  "AI_LLM_PROVIDER",
  "AI_LLM_MODEL",
  "AI_LLM_TEMPERATURE",
  "AI_EMBEDDING_PROVIDER",
  "AI_EMBEDDING_MODEL",
  "AI_EMBEDDING_DIMENSION",
  "AI_RETRIEVAL_TOP_K",
  "AI_RERANK_TOP_K",
  "AI_RERANKER_PROVIDER",
  "AI_MAX_REGENERATION_ATTEMPTS",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_AI_API_KEY",
  "OPENAI_MODEL",
];

describe("config", async () => {
  const {
    llmProvider,
    llmModel,
    llmTemperature,
    embeddingProvider,
    embeddingModel,
    embeddingDimension,
    retrievalTopK,
    rerankTopK,
    rerankerProvider,
    maxRegenerationAttempts,
    hasLLMKey,
    hasEmbeddingKey,
  } = await import("./config");

  beforeEach(() => {
    for (const key of KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("defaults to openai provider and gpt-4o-mini model", () => {
    assert.equal(llmProvider(), "openai");
    assert.equal(llmModel(), "gpt-4o-mini");
    assert.equal(llmTemperature(), 0.1);
  });

  it("respects AI_LLM_PROVIDER and AI_LLM_MODEL overrides", () => {
    process.env.AI_LLM_PROVIDER = "anthropic";
    process.env.AI_LLM_MODEL = "claude-3-opus-20240229";
    assert.equal(llmProvider(), "anthropic");
    assert.equal(llmModel(), "claude-3-opus-20240229");
  });

  it("picks the right default model per provider", () => {
    process.env.AI_LLM_PROVIDER = "anthropic";
    assert.equal(llmModel(), "claude-3-haiku-20240307");

    process.env.AI_LLM_PROVIDER = "google";
    assert.equal(llmModel(), "gemini-1.5-flash");
  });

  it("uses OPENAI_MODEL as model shorthand for openai provider", () => {
    process.env.OPENAI_MODEL = "gpt-4o";
    assert.equal(llmModel(), "gpt-4o");
  });

  it("returns hasLLMKey=false when no key is set", () => {
    assert.equal(hasLLMKey(), false);
  });

  it("returns hasLLMKey=true when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(hasLLMKey(), true);
  });

  it("returns hasLLMKey=true for anthropic when ANTHROPIC_API_KEY is set", () => {
    process.env.AI_LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "ant-test";
    assert.equal(hasLLMKey(), true);
  });

  it("embedding defaults match openai provider", () => {
    assert.equal(embeddingProvider(), "openai");
    assert.equal(embeddingModel(), "text-embedding-3-small");
    assert.equal(embeddingDimension(), 1536);
  });

  it("embedding dimension is 768 for google text-embedding-004", () => {
    process.env.AI_EMBEDDING_PROVIDER = "google";
    assert.equal(embeddingDimension(), 768);
  });

  it("embedding dimension can be overridden", () => {
    process.env.AI_EMBEDDING_DIMENSION = "3072";
    assert.equal(embeddingDimension(), 3072);
  });

  it("retrieval K defaults are 20 and 5", () => {
    assert.equal(retrievalTopK(), 20);
    assert.equal(rerankTopK(), 5);
  });

  it("respects numeric env overrides", () => {
    process.env.AI_RETRIEVAL_TOP_K = "50";
    process.env.AI_RERANK_TOP_K = "10";
    assert.equal(retrievalTopK(), 50);
    assert.equal(rerankTopK(), 10);
  });

  it("defaults reranker to llm and max regeneration to 2", () => {
    assert.equal(rerankerProvider(), "llm");
    assert.equal(maxRegenerationAttempts(), 2);
  });

  it("hasEmbeddingKey is false when no key set", () => {
    assert.equal(hasEmbeddingKey(), false);
  });

  it("hasEmbeddingKey is true when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(hasEmbeddingKey(), true);
  });
});
