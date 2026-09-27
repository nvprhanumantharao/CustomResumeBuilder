import type { JdGap } from "../jd/types";
import type { AtsReport } from "./ats";

export interface CitedText {
  text: string;
  evidenceIds: string[];
}

export interface ResumeBullet extends CitedText {
  score: number;
}

export interface ResumeRole {
  employer: string;
  title: string;
  location: string;
  dates: string;
  evidenceIds: string[];
  bullets: ResumeBullet[];
}

export interface ResumeEducation extends CitedText {
  school: string;
  degree: string;
  dates: string;
}

export interface DroppedLine {
  text: string;
  reason: string;
  evidenceIds: string[];
}

export type GeneratorMode = "heuristic" | "openai";

export interface ResumeDocument {
  name: string;
  headline: string;
  contactLine: string;
  contactEvidenceIds: string[];
  summary: CitedText;
  skills: CitedText[];
  experience: ResumeRole[];
  education: ResumeEducation[];
  gaps: JdGap[];
  validation: {
    dropped: DroppedLine[];
  };
  lineEstimate: number;
  trimmedBullets: number;
  mode: GeneratorMode;
  /** Present after generation. Older saved drafts may omit it. */
  ats?: AtsReport;
}

export interface RewriteBullet {
  text: string;
  evidenceIds: string[];
}

export interface RewriteDraft {
  summary?: CitedText;
  skillIds?: string[];
  bullets?: RewriteBullet[];
}

export interface ResumeLine {
  section: string;
  text: string;
  evidenceIds: string[];
}
