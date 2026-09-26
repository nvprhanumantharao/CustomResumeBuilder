import { extractUploadText } from "@/lib/extract";
import { errorResponse } from "@/lib/http";
import { parseWithModel } from "@/lib/llm";
import { parseResumeHeuristic } from "@/lib/profile/parse";
import type { CareerProfile } from "@/lib/profile/types";
import type { GeneratorMode } from "@/lib/resume/types";

export const runtime = "nodejs";

async function readText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");
    if (file instanceof File && file.size > 0) return extractUploadText(file);
    if (typeof pasted === "string" && pasted.trim()) return pasted;
    throw new Error("Upload a PDF or DOCX, or paste resume text.");
  }
  const body = (await request.json()) as { text?: string };
  if (!body.text?.trim()) throw new Error("Paste resume text to parse.");
  return body.text;
}

export async function POST(request: Request) {
  try {
    const text = await readText(request);
    let mode: GeneratorMode = "heuristic";
    let warnings: string[] = [];
    let profile: CareerProfile | null = await parseWithModel(text);
    if (profile) {
      mode = "openai";
    } else {
      const parsed = parseResumeHeuristic(text);
      profile = parsed.profile;
      warnings = parsed.warnings;
    }
    return Response.json({ profile, warnings, mode });
  } catch (error) {
    return errorResponse(error);
  }
}
