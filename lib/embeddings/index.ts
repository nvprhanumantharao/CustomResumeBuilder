/**
 * Embedding service — provider abstraction.
 *
 * Generates dense vector embeddings for candidate evidence chunks and JD
 * requirement text.  Embeddings power the semantic retrieval stage.
 *
 * Supported providers (selected via AI_EMBEDDING_PROVIDER env var):
 *   openai  — text-embedding-3-small (default)
 *   google  — text-embedding-004
 *
 * Cache hierarchy (fastest → slowest):
 *   L1 — in-process Map<key, vector>  (lost on restart)
 *   L2 — local JSON file (.embeddings-cache/<model>.json)  (survives restarts)
 *   L3 — embedding API call  (costs money, has latency)
 *
 * Other features:
 *   - Batch embedding to minimise API calls.
 *   - Retry once on transient errors.
 *   - Logs usage without PII.
 */

import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  embeddingModel,
  embeddingProvider,
  googleAIKey,
  hasEmbeddingKey,
  openAIKey,
} from "../config";
import {
  fileStoreGet,
  fileStoreBatchSet,
  fileStoreSet,
  fileStoreClearMemory,
} from "./file-store";

// ---------------------------------------------------------------------------
// L1 — in-process cache
// ---------------------------------------------------------------------------

const l1 = new Map<string, number[]>();

function cacheKey(text: string, model: string): string {
  return `${model}::${text.length}::${text.slice(0, 64)}::${text.slice(-32)}`;
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

async function buildEmbeddingModel() {
  const provider = embeddingProvider();
  const model = embeddingModel();

  if (provider === "google") {
    if (!googleAIKey()) {
      throw new Error("GOOGLE_AI_API_KEY is required for the google embedding provider.");
    }
    try {
      const pkgName = ["@", "ai-sdk", "/", "google"].join("");
      const mod = await import(pkgName);
      return mod.google.textEmbeddingModel(model);
    } catch {
      throw new Error(
        "AI_EMBEDDING_PROVIDER=google but @ai-sdk/google is not installed. Run: npm install @ai-sdk/google",
      );
    }
  }

  // Default: openai
  if (!openAIKey()) {
    throw new Error("OPENAI_API_KEY is required for the openai embedding provider.");
  }
  return openai.embedding(model);
}

// ---------------------------------------------------------------------------
// Single embedding
// ---------------------------------------------------------------------------

/**
 * Generates an embedding vector for a single text string.
 *
 * Cache lookup order: L1 (memory) → L2 (file) → L3 (API).
 * Returns null when no embedding key is configured or on unrecoverable error.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!hasEmbeddingKey()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const model = embeddingModel();
  const key = cacheKey(trimmed, model);

  // L1 hit
  const l1Hit = l1.get(key);
  if (l1Hit) return l1Hit;

  // L2 hit
  const l2Hit = await fileStoreGet(key, model);
  if (l2Hit) {
    l1.set(key, l2Hit); // promote to L1
    return l2Hit;
  }

  // L3 — call the API
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const embModel = await buildEmbeddingModel();
      const { embedding } = await embed({ model: embModel, value: trimmed });
      l1.set(key, embedding);
      await fileStoreSet(key, model, embedding); // write-through to L2
      console.log(
        `[embeddings] Generated embedding (provider=${embeddingProvider()} model=${model} dim=${embedding.length} l1=miss l2=miss)`,
      );
      return embedding;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error(
    `[embeddings] Failed to embed text (provider=${embeddingProvider()} model=${model}).`,
    lastError instanceof Error ? lastError.message : String(lastError),
  );
  return null;
}

// ---------------------------------------------------------------------------
// Batch embedding
// ---------------------------------------------------------------------------

/**
 * Generates embeddings for multiple texts in a single API call where possible.
 *
 * Cache lookup order per item: L1 → L2 → (batched) L3.
 * Only truly uncached items reach the API.  Maintains original array order.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (!hasEmbeddingKey()) return texts.map(() => null);

  const model = embeddingModel();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const trimmed = texts[i]?.trim() ?? "";
    if (!trimmed) continue;

    const key = cacheKey(trimmed, model);

    // L1
    const l1Hit = l1.get(key);
    if (l1Hit) { results[i] = l1Hit; continue; }

    // L2
    const l2Hit = await fileStoreGet(key, model);
    if (l2Hit) {
      l1.set(key, l2Hit);
      results[i] = l2Hit;
      continue;
    }

    uncachedIndices.push(i);
    uncachedTexts.push(trimmed);
  }

  if (uncachedTexts.length === 0) {
    console.log(
      `[embeddings] Batch: all ${texts.length} items served from cache (l1+l2)`,
    );
    return results;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const embModel = await buildEmbeddingModel();
      const { embeddings } = await embedMany({ model: embModel, values: uncachedTexts });

      const newEntries: { key: string; vector: number[] }[] = [];
      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j]!;
        const vec = embeddings[j]!;
        results[idx] = vec;
        const key = cacheKey(uncachedTexts[j]!, model);
        l1.set(key, vec);
        newEntries.push({ key, vector: vec });
      }

      await fileStoreBatchSet(newEntries, model); // single flush for the whole batch

      const cachedCount = texts.length - uncachedTexts.length;
      console.log(
        `[embeddings] Batch embedded ${uncachedTexts.length} new items, ` +
          `${cachedCount} served from cache (provider=${embeddingProvider()} model=${model})`,
      );
      return results;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.error(
    `[embeddings] Batch embed failed (provider=${embeddingProvider()} model=${model}).`,
    lastError instanceof Error ? lastError.message : String(lastError),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------

/**
 * Computes cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1].  Returns 0 for zero-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/**
 * Clears both the L1 in-process cache and the L2 file-store memory layer.
 * The JSON file on disk is NOT deleted (use `clearEmbeddingCacheFile()` for that).
 * Useful in tests to force a cold-cache scenario.
 */
export function clearEmbeddingCache(): void {
  l1.clear();
  fileStoreClearMemory();
}

/**
 * Deletes the on-disk cache file for the current model.
 * Server-only; no-op in browser contexts.
 */
export async function clearEmbeddingCacheFile(model?: string): Promise<void> {
  const m = model ?? embeddingModel();
  fileStoreClearMemory(m);
  if (typeof window !== "undefined") return;
  try {
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    const PROJECT_ROOT = process.cwd();
    const file = path.join(PROJECT_ROOT, ".embeddings-cache", `${m.replace(/[^a-z0-9_.-]/gi, "-").toLowerCase()}.json`);
    await unlink(file);
    console.log(`[embeddings-store] Deleted cache file for model=${m}`);
  } catch {
    // File may not exist — that's fine
  }
}
