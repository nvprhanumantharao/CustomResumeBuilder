import { analyzeJobHeuristic } from "@/lib/jd/analyze";
import type { JdAnalysis } from "@/lib/jd/types";
import { extractUploadText } from "@/lib/extract";
import { errorResponse } from "@/lib/http";
import { analyzeWithModel } from "@/lib/llm";
import { matchProfile } from "@/lib/match/score";
import type { CareerProfile } from "@/lib/profile/types";
import type { GeneratorMode } from "@/lib/resume/types";

export const runtime = "nodejs";

function isProfile(value: unknown): value is CareerProfile {
  return Boolean(value && typeof value === "object" && "skills" in value && "employment" in value);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let text = "";
    let profile: CareerProfile | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const pasted = form.get("text");
      const rawProfile = form.get("profile");
      if (file instanceof File && file.size > 0) text = await extractUploadText(file);
      else if (typeof pasted === "string") text = pasted;
      if (typeof rawProfile === "string" && rawProfile.trim()) {
        profile = JSON.parse(rawProfile) as CareerProfile;
      }
    } else {
      const body = (await request.json()) as { text?: string; profile?: CareerProfile };
      text = body.text ?? "";
      profile = body.profile ?? null;
    }

    if (!isProfile(profile)) throw new Error("Add a career profile before analyzing a job.");
    if (!text.trim()) throw new Error("Paste a job description or upload a PDF or DOCX.");

    let mode: GeneratorMode = "heuristic";
    let analysis: JdAnalysis | null = await analyzeWithModel(text);
    if (analysis) mode = "openai";
    else analysis = analyzeJobHeuristic(text);

    const match = matchProfile(profile, analysis);
    return Response.json({ analysis, match, mode });
  } catch (error) {
    return errorResponse(error);
  }
}
