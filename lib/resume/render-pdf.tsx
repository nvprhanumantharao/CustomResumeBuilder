import { renderToBuffer } from "@react-pdf/renderer";
import type { ResumeDocument } from "./types";
import { ResumePdf } from "./pdf-document";

export async function renderResumePdf(resume: ResumeDocument): Promise<Buffer> {
  return renderToBuffer(<ResumePdf resume={resume} />);
}
