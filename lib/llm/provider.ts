/**
 * Multi-provider LLM abstraction.
 *
 * Selects the correct Vercel AI SDK provider based on AI_LLM_PROVIDER.
 * Business logic (prompts, schemas, validation) stays in the callers; this
 * module only handles provider wiring, retries, and error logging.
 *
 * Supported providers:
 *   openai    — @ai-sdk/openai   (default)
 *   anthropic — @ai-sdk/anthropic
 *   google    — @ai-sdk/google
 *
 * Install optional providers when needed:
 *   npm install @ai-sdk/anthropic
 *   npm install @ai-sdk/google
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import {
  hasLLMKey,
  llmModel,
  llmProvider,
  llmTemperature,
  openAIKey,
} from "../config";

// ---------------------------------------------------------------------------
// Internal: provider selection
// ---------------------------------------------------------------------------

async function buildModel() {
  const provider = llmProvider();
  const model = llmModel();

  if (provider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(model);
  }

  if (provider === "anthropic") {
    // Dynamic import hidden to avoid Next.js static tracing warnings
    try {
      const pkgName = ["@", "ai-sdk", "/", "anthropic"].join("");
      const mod = await import(pkgName);
      return mod.anthropic(model);
    } catch {
      throw new Error(
        "AI_LLM_PROVIDER=anthropic but @ai-sdk/anthropic is not installed. Run: npm install @ai-sdk/anthropic",
      );
    }
  }

  if (provider === "google") {
    try {
      const pkgName = ["@", "ai-sdk", "/", "google"].join("");
      const mod = await import(pkgName);
      return mod.google(model);
    } catch {
      throw new Error(
        "AI_LLM_PROVIDER=google but @ai-sdk/google is not installed. Run: npm install @ai-sdk/google",
      );
    }
  }

  // Fallback to openai
  const { openai } = await import("@ai-sdk/openai");
  return openai(model);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a structured (schema-constrained) response from the configured LLM.
 *
 * Returns null when:
 *   - No API key is configured for the active provider.
 *   - The model call fails (error is logged, not rethrown).
 *
 * @param schema   Zod schema describing the expected output shape.
 * @param system   System-level instruction (injected before user content).
 * @param prompt   User-facing prompt content.
 */
export async function callLLMStructured<T>(
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<T | null> {
  if (!hasLLMKey()) return null;
  try {
    const aiModel = await buildModel();
    const { output } = await generateText({
      model: aiModel,
      output: Output.object({ schema }),
      system,
      prompt,
      temperature: llmTemperature(),
    });
    return output;
  } catch (error) {
    // Log provider / model info for observability but never log prompt content
    // (it may contain candidate PII or sensitive JD text).
    console.error(
      `[llm] Structured call failed (provider=${llmProvider()} model=${llmModel()}).`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Generates a plain-text response from the configured LLM.
 *
 * Returns null on key absence or error.
 */
export async function callLLMText(system: string, prompt: string): Promise<string | null> {
  if (!hasLLMKey()) return null;
  try {
    const aiModel = await buildModel();
    const { text } = await generateText({
      model: aiModel,
      system,
      prompt,
      temperature: llmTemperature(),
    });
    return text ?? null;
  } catch (error) {
    console.error(
      `[llm] Text call failed (provider=${llmProvider()} model=${llmModel()}).`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Re-export legacy helpers so existing code in lib/llm/index.ts is unchanged.
// ---------------------------------------------------------------------------

/** True when a key is present for the current provider (backward compat). */
export function hasOpenAIKey(): boolean {
  return Boolean(openAIKey());
}
