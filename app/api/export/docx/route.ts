import { renderResumeDocx } from "@/lib/resume/docx";
import { downloadName, errorResponse } from "@/lib/http";
import type { ResumeDocument } from "@/lib/resume/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { resume?: ResumeDocument };
    if (!body.resume) throw new Error("Build a resume before downloading a DOCX.");
    const buffer = await renderResumeDocx(body.resume);
    const filename = downloadName(body.resume.name, "docx");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
