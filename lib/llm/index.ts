import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createId } from "../profile/ids";
import type { CareerProfile } from "../profile/types";
import type { JdAnalysis } from "../jd/types";
import type { MatchResult } from "../match/score";
import { collectEvidence } from "../profile/evidence";
import type { RewriteDraft } from "../resume/types";

const profileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.string()),
  headline: z.string(),
  summary: z.string(),
  employment: z.array(
    z.object({
      employer: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      achievements: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      details: z.string(),
    }),
  ),
  skills: z.array(z.string()),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string(),
      year: z.string(),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      achievements: z.array(z.string()),
    }),
  ),
});

const analysisSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  domain: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
});

const rewriteSchema = z.object({
  summary: z.object({
    text: z.string(),
    evidenceIds: z.array(z.string()),
  }),
  skillIds: z.array(z.string()),
  bullets: z.array(
    z.object({
      text: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function structured<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T | null> {
  if (!hasOpenAIKey()) return null;
  try {
    const { output } = await generateText({
      model: openai(process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini"),
      output: Output.object({ schema }),
      system,
      prompt,
    });
    return output;
  } catch (error) {
    console.error("Structured model call failed; using the heuristic path.", error);
    return null;
  }
}

export async function parseWithModel(text: string): Promise<CareerProfile | null> {
  const parsed = await structured(
    profileSchema,
    "Extract a career profile from a resume. Copy only facts that appear in the text. Do not invent employers, schools, skills, certifications, accomplishments, dates, or metrics. Use empty strings and empty arrays when a field is absent. Copy achievement sentences verbatim.",
    text,
  );
  if (!parsed) return null;
  if (parsed.employment.length === 0 && parsed.skills.length === 0 && !parsed.summary.trim()) {
    return null;
  }
  return {
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    location: parsed.location,
    links: parsed.links.filter(Boolean),
    headline: parsed.headline,
    summary: parsed.summary,
    employment: parsed.employment.map((job) => ({
      id: createId("emp"),
      employer: job.employer,
      title: job.title,
      location: job.location,
      start: job.start,
      end: job.end,
      achievements: job.achievements.filter(Boolean).map((achievement) => ({
        id: createId("ach"),
        text: achievement,
      })),
    })),
    education: parsed.education.map((item) => ({
      id: createId("edu"),
      ...item,
    })),
    skills: parsed.skills.filter(Boolean).map((name) => ({ id: createId("skill"), name })),
    certifications: parsed.certifications.filter((item) => item.name).map((item) => ({
      id: createId("cert"),
      ...item,
    })),
    projects: parsed.projects.filter((item) => item.name).map((item) => ({
      id: createId("proj"),
      name: item.name,
      description: item.description,
      achievements: item.achievements.filter(Boolean).map((achievement) => ({
        id: createId("pach"),
        text: achievement,
      })),
    })),
  };
}

export async function analyzeWithModel(text: string): Promise<JdAnalysis | null> {
  const parsed = await structured(
    analysisSchema,
    "Analyze a job description. Extract the title, seniority, domain, required skills, preferred skills, responsibilities, and ATS keywords. Use only phrases from the posting. Do not add skills the posting does not mention.",
    text,
  );
  if (!parsed) return null;
  if (parsed.requiredSkills.length === 0 && parsed.preferredSkills.length === 0) return null;
  return parsed;
}

export async function rewriteWithModel(
  profile: CareerProfile,
  analysis: JdAnalysis,
  match: MatchResult,
): Promise<RewriteDraft | null> {
  const catalog = collectEvidence(profile).map((item) => ({
    id: item.id,
    kind: item.kind,
    quote: item.quote,
  }));
  const gaps = match.gaps.map((gap) => gap.requirement);
  const parsed = await structured(
    rewriteSchema,
    "Rewrite resume lines using only the supplied evidence catalog. Every line must include the evidence ids that support it. You may reword and select. You must not invent employers, skills, technologies, certifications, accomplishments, or metrics. Do not introduce a number, percent, or tool that is absent from the cited quotes. Do not mention the listed job gaps. If a point cannot be supported, omit it.",
    JSON.stringify({
      job: {
        title: analysis.title,
        requiredSkills: analysis.requiredSkills,
        preferredSkills: analysis.preferredSkills,
        responsibilities: analysis.responsibilities,
      },
      gaps,
      evidence: catalog,
    }),
  );
  return parsed;
}
