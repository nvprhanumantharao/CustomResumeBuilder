import { errorResponse } from "@/lib/http";
import type { JdAnalysis } from "@/lib/jd/types";
import { runPipeline } from "@/lib/pipeline";
import type { CareerProfile } from "@/lib/profile/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { profile?: CareerProfile; analysis?: JdAnalysis };
    if (!body.profile || !body.analysis) {
      throw new Error("A profile and job analysis are required before building a resume.");
    }
    const result = await runPipeline(body.profile, body.analysis);
    return Response.json({
      resume: result.resume,
      match: result.match,
      mode: result.mode,
      pipeline: {
        generationAttempts: result.generationAttempts,
        semanticEnabled: result.retrieval.semanticEnabled,
        subScores: result.match.subScores,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
