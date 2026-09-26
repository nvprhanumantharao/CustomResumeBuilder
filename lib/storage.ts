import type { JdAnalysis } from "./jd/types";
import type { MatchResult } from "./match/score";
import { blankProfile } from "./profile/sample";
import type { CareerProfile } from "./profile/types";
import type { GeneratorMode, ResumeDocument } from "./resume/types";

const KEY = "evidence-resume-v1";

export interface DraftState {
  step: number;
  profile: CareerProfile | null;
  sourceText: string;
  jdText: string;
  analysis: JdAnalysis | null;
  match: MatchResult | null;
  resume: ResumeDocument | null;
  mode: GeneratorMode | null;
  warnings: string[];
}

export function normalizeProfile(profile: CareerProfile): CareerProfile {
  const blank = blankProfile();
  return {
    ...blank,
    ...profile,
    links: profile.links ?? [],
    employment: (profile.employment ?? []).map((job) => ({
      ...job,
      achievements: job.achievements ?? [],
    })),
    education: profile.education ?? [],
    skills: profile.skills ?? [],
    certifications: profile.certifications ?? [],
    projects: (profile.projects ?? []).map((project) => ({
      ...project,
      achievements: project.achievements ?? [],
    })),
  };
}

export function loadDraft(): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftState;
    if (parsed.profile) parsed.profile = normalizeProfile(parsed.profile);
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(state: DraftState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
