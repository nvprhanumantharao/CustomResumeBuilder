import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { analyzeJobHeuristic } from "./jd/analyze";
import { sampleJobDescription } from "./jd/sample";
import { matchProfile } from "./match/score";
import { sampleProfile, sampleResumeText } from "./profile/sample";
import { renderResumeDocx } from "./resume/docx";
import { generateResume } from "./resume/generate";

mock.module("@/lib/resume/render-pdf", {
  namedExports: {
    renderResumePdf: async () => Buffer.from("%PDF-1.4\n" + "x".repeat(200)),
  },
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API routes", async () => {
  const { POST: analyzePost } = await import("../app/api/analyze/route");
  const { POST: docxPost } = await import("../app/api/export/docx/route");
  const { POST: pdfPost } = await import("../app/api/export/pdf/route");
  const { POST: generatePost } = await import("../app/api/generate/route");
  const { POST: parsePost } = await import("../app/api/parse/route");
  it("parses pasted text and an uploaded text file", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const parsed = await parsePost(
      jsonRequest("http://local/api/parse", { text: sampleResumeText }),
    );
    assert.equal(parsed.status, 200);
    const payload = (await parsed.json()) as {
      profile: { name: string };
      mode: string;
    };
    assert.equal(payload.profile.name, "Maya Chen");
    assert.equal(payload.mode, "heuristic");

    const form = new FormData();
    form.set(
      "file",
      new File([sampleResumeText], "resume.txt", { type: "text/plain" }),
    );
    const uploaded = await parsePost(
      new Request("http://local/api/parse", { method: "POST", body: form }),
    );
    assert.equal(uploaded.status, 200);

    const pasted = new FormData();
    pasted.set("text", sampleResumeText);
    const pastedResponse = await parsePost(
      new Request("http://local/api/parse", { method: "POST", body: pasted }),
    );
    assert.equal(pastedResponse.status, 200);

    const emptyForm = new FormData();
    const emptyUpload = await parsePost(
      new Request("http://local/api/parse", {
        method: "POST",
        body: emptyForm,
      }),
    );
    assert.equal(emptyUpload.status, 400);

    const missing = await parsePost(
      jsonRequest("http://local/api/parse", { text: "  " }),
    );
    assert.equal(missing.status, 400);
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("analyzes a posting and a multipart upload", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const response = await analyzePost(
      jsonRequest("http://local/api/analyze", {
        profile: sampleProfile,
        text: sampleJobDescription,
      }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      match: { score: number };
      mode: string;
    };
    assert.equal(payload.mode, "heuristic");
    assert.equal(typeof payload.match.score, "number");

    const form = new FormData();
    form.set("text", sampleJobDescription);
    form.set("profile", JSON.stringify(sampleProfile));
    const uploaded = await analyzePost(
      new Request("http://local/api/analyze", { method: "POST", body: form }),
    );
    assert.equal(uploaded.status, 200);

    const fileForm = new FormData();
    fileForm.set(
      "file",
      new File([sampleJobDescription], "job.txt", { type: "text/plain" }),
    );
    fileForm.set("profile", JSON.stringify(sampleProfile));
    const fromFile = await analyzePost(
      new Request("http://local/api/analyze", {
        method: "POST",
        body: fileForm,
      }),
    );
    assert.equal(fromFile.status, 200);

    const badProfile = new FormData();
    badProfile.set("text", sampleJobDescription);
    badProfile.set("profile", "{}");
    const badUpload = await analyzePost(
      new Request("http://local/api/analyze", {
        method: "POST",
        body: badProfile,
      }),
    );
    assert.equal(badUpload.status, 400);

    const bad = await analyzePost(
      jsonRequest("http://local/api/analyze", { text: sampleJobDescription }),
    );
    assert.equal(bad.status, 400);
    const emptyJob = await analyzePost(
      jsonRequest("http://local/api/analyze", {
        profile: sampleProfile,
        text: "  ",
      }),
    );
    assert.equal(emptyJob.status, 400);
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("generates a resume from a profile and analysis", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const response = await generatePost(
      jsonRequest("http://local/api/generate", {
        profile: sampleProfile,
        analysis,
      }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { resume: { mode: string } };
    assert.equal(payload.resume.mode, "heuristic");
    const missing = await generatePost(
      jsonRequest("http://local/api/generate", {}),
    );
    assert.equal(missing.status, 400);
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("exports PDF and DOCX downloads", async () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const resume = generateResume(
      sampleProfile,
      analysis,
      match,
      null,
      "heuristic",
    );
    const pdf = await pdfPost(
      jsonRequest("http://local/api/export/pdf", { resume }),
    );
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get("Content-Type") ?? "", /pdf/);
    assert.ok((await pdf.arrayBuffer()).byteLength > 100);

    const summaryOnly = await pdfPost(
      jsonRequest("http://local/api/export/pdf", {
        resume: { ...resume, name: "", summary: resume.summary },
      }),
    );
    assert.equal(summaryOnly.status, 200);

    const missingPdf = await pdfPost(
      jsonRequest("http://local/api/export/pdf", { resume: { skills: [] } }),
    );
    assert.equal(missingPdf.status, 400);

    const docx = await docxPost(
      jsonRequest("http://local/api/export/docx", { resume }),
    );
    assert.equal(docx.status, 200);
    assert.match(
      docx.headers.get("Content-Disposition") ?? "",
      /maya-chen-resume\.docx/,
    );
    assert.ok((await docx.arrayBuffer()).byteLength > 100);

    const sparse = {
      ...resume,
      name: "",
      headline: "",
      contactLine: "",
      summary: { text: "", evidenceIds: [] },
      skills: [],
      experience: [
        {
          employer: "Acme",
          title: "Engineer",
          location: "",
          dates: "",
          evidenceIds: ["emp"],
          bullets: [],
        },
      ],
      education: [],
    };
    const direct = await renderResumeDocx(resume);
    assert.ok(direct.byteLength > 100);
    const sparseDirect = await renderResumeDocx(sparse);
    assert.ok(sparseDirect.byteLength > 100);

    const sparseDocx = await docxPost(
      jsonRequest("http://local/api/export/docx", { resume: sparse }),
    );
    assert.equal(sparseDocx.status, 200);
    const sparsePdf = await pdfPost(
      jsonRequest("http://local/api/export/pdf", {
        resume: { ...sparse, name: "Ada" },
      }),
    );
    assert.equal(sparsePdf.status, 200);

    const missingDocx = await docxPost(
      jsonRequest("http://local/api/export/docx", {}),
    );
    assert.equal(missingDocx.status, 400);
  });
});
