import { downloadName, errorResponse } from "@/lib/http";
import { renderResumePdf } from "@/lib/resume/render-pdf";
import type { ResumeDocument } from "@/lib/resume/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { resume?: ResumeDocument };
    if (!body.resume?.name && !body.resume?.summary) {
      throw new Error("Build a resume before downloading a PDF.");
    }
    const buffer = await renderResumePdf(body.resume);
    const filename = downloadName(body.resume.name, "pdf");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
