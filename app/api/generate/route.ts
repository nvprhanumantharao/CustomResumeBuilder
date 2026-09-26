import { errorResponse } from "@/lib/http";
import type { JdAnalysis } from "@/lib/jd/types";
import { rewriteWithModel } from "@/lib/llm";
import { matchProfile } from "@/lib/match/score";
import type { CareerProfile } from "@/lib/profile/types";
import { generateResume } from "@/lib/resume/generate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { profile?: CareerProfile; analysis?: JdAnalysis };
    if (!body.profile || !body.analysis) {
      throw new Error("A profile and job analysis are required before building a resume.");
    }
    const match = matchProfile(body.profile, body.analysis);
    const rewrite = await rewriteWithModel(body.profile, body.analysis, match);
    const resume = generateResume(
      body.profile,
      body.analysis,
      match,
      rewrite,
      rewrite ? "openai" : "heuristic",
    );
    return Response.json({ resume, match, mode: resume.mode });
  } catch (error) {
    return errorResponse(error);
  }
}
