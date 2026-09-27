/**
 * File-based embedding cache.
 *
 * Persists embedding vectors to disk as a single JSON file so they survive
 * server restarts.  The store lives at:
 *
 *   .embeddings-cache/<model-slug>.json
 *
 * (relative to the project root, gitignored)
 *
 * Format:
 *   { "<cacheKey>": [0.12, -0.34, ...], ... }
 *
 * Behaviour:
 *   - Lazy load: the file is read once on first access and held in memory.
 *   - Write-through: every new embedding is flushed to disk immediately.
 *   - Safe writes: written to a temp file then renamed to avoid corruption.
 *   - Browser-safe: all fs calls are guarded so the module can be imported
 *     in client bundles without errors (it simply becomes a no-op).
 *   - Model-scoped: a separate file per model slug prevents dimension mismatches
 *     when the configured model changes.
 */

import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoreData = Record<string, number[]>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Root of the project (two levels up from lib/embeddings/). */
const PROJECT_ROOT = path.resolve(process.cwd());

/** Directory that holds the cache files. */
const CACHE_DIR = path.join(PROJECT_ROOT, ".embeddings-cache");

/** Slugify a model name for use as a filename, e.g. "text-embedding-3-small". */
function modelSlug(model: string): string {
  return model.replace(/[^a-z0-9_.-]/gi, "-").toLowerCase();
}

function storeFile(model: string): string {
  return path.join(CACHE_DIR, `${modelSlug(model)}.json`);
}

// ---------------------------------------------------------------------------
// Node.js fs helpers (server-only)
// ---------------------------------------------------------------------------

function isServer(): boolean {
  return typeof process !== "undefined" && typeof window === "undefined";
}

async function ensureCacheDir(): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CACHE_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// In-process layer (acts as L1; file is L2)
// ---------------------------------------------------------------------------

/** model → { cacheKey → vector } */
const memoryLayer = new Map<string, StoreData>();
/** model → whether we have loaded the file at least once */
const loaded = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Loads the on-disk store for a model into memory (once).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
async function loadStore(model: string): Promise<StoreData> {
  if (loaded.get(model)) return memoryLayer.get(model) ?? {};
  if (!isServer()) {
    loaded.set(model, true);
    memoryLayer.set(model, {});
    return {};
  }

  let data: StoreData = {};
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(storeFile(model), "utf8");
    data = JSON.parse(raw) as StoreData;
    console.log(
      `[embeddings-store] Loaded ${Object.keys(data).length} cached embeddings from disk (model=${model})`,
    );
  } catch {
    // File doesn't exist yet — start empty
  }

  memoryLayer.set(model, data);
  loaded.set(model, true);
  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads an embedding from the file store.
 * Returns undefined when the key is not cached.
 */
export async function fileStoreGet(key: string, model: string): Promise<number[] | undefined> {
  const store = await loadStore(model);
  return store[key];
}

/**
 * Writes an embedding to both the in-memory layer and the JSON file.
 *
 * Uses a write-then-rename pattern to avoid partial writes corrupting the file.
 */
export async function fileStoreSet(
  key: string,
  model: string,
  vector: number[],
): Promise<void> {
  const store = await loadStore(model);
  store[key] = vector;

  if (!isServer()) return;

  try {
    await ensureCacheDir();
    const { writeFile, rename } = await import("node:fs/promises");
    const file = storeFile(model);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(store), "utf8");
    await rename(tmp, file);
  } catch (error) {
    // Non-fatal: in-memory cache is still warm
    console.error(
      `[embeddings-store] Failed to persist cache to disk (model=${model}):`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Writes multiple entries in a single flush (more efficient for batch embed).
 */
export async function fileStoreBatchSet(
  entries: { key: string; vector: number[] }[],
  model: string,
): Promise<void> {
  const store = await loadStore(model);
  for (const { key, vector } of entries) {
    store[key] = vector;
  }

  if (!isServer() || entries.length === 0) return;

  try {
    await ensureCacheDir();
    const { writeFile, rename } = await import("node:fs/promises");
    const file = storeFile(model);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(store), "utf8");
    await rename(tmp, file);
  } catch (error) {
    console.error(
      `[embeddings-store] Failed to persist batch cache (model=${model}):`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Returns the number of entries cached on disk for a model.
 * Useful for logging / diagnostics.
 */
export async function fileStoreSize(model: string): Promise<number> {
  const store = await loadStore(model);
  return Object.keys(store).length;
}

/**
 * Clears the in-memory layer for a model (does NOT delete the file).
 * Forces the next read to reload from disk.  Useful in tests.
 */
export function fileStoreClearMemory(model?: string): void {
  if (model) {
    memoryLayer.delete(model);
    loaded.delete(model);
  } else {
    memoryLayer.clear();
    loaded.clear();
  }
}
