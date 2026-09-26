import type { JdGap } from "../jd/types";
import { collectEvidence, employersOf, schoolsOf } from "../profile/evidence";
import type { CareerProfile, EvidenceRef } from "../profile/types";
import {
  findMentionedTerms,
  metricAllowed,
  metricTokens,
  requirementMentioned,
  sameTerm,
  termMentioned,
  TECH_TERMS,
} from "../text";
import type { ResumeDocument } from "./types";

export interface ValidationContext {
  evidenceById: Map<string, EvidenceRef>;
  employers: string[];
  schools: string[];
  profileSkillNames: string[];
  gaps: JdGap[];
  candidates: string[];
}

const ORG_RE =
  /\b(?:at|for|with|from)\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,4})/g;

export function createValidationContext(profile: CareerProfile, gaps: JdGap[]): ValidationContext {
  const evidence = collectEvidence(profile);
  const skillNames = profile.skills.map((skill) => skill.name.trim()).filter(Boolean);
  const gapTerms = gaps.map((gap) => gap.requirement);
  return {
    evidenceById: new Map(evidence.map((item) => [item.id, item])),
    employers: employersOf(profile),
    schools: schoolsOf(profile),
    profileSkillNames: skillNames,
    gaps,
    candidates: [...skillNames, ...gapTerms, ...TECH_TERMS, ...profile.certifications.map((cert) => cert.name)],
  };
}

function quotesFor(ids: string[], ctx: ValidationContext): string {
  return ids
    .map((id) => ctx.evidenceById.get(id)?.quote ?? "")
    .filter(Boolean)
    .join("\n");
}

function skillAllowed(term: string, quotes: string, ctx: ValidationContext): boolean {
  if (ctx.profileSkillNames.some((skill) => sameTerm(skill, term) || termMentioned(skill, term))) {
    return true;
  }
  return termMentioned(quotes, term);
}

export function explainLineRejection(
  text: string,
  evidenceIds: string[],
  ctx: ValidationContext,
): string | null {
  const line = text.trim();
  if (!line) return null;
  if (evidenceIds.length === 0) return "Line does not cite evidence.";
  for (const id of evidenceIds) {
    if (!ctx.evidenceById.has(id)) return `Cites missing evidence id ${id}.`;
  }
  for (const gap of ctx.gaps) {
    if (requirementMentioned(line, gap.requirement)) {
      return `Job requirement “${gap.requirement}” has no supporting evidence and stays out of the resume.`;
    }
  }
  const quotes = quotesFor(evidenceIds, ctx);
  const quoteMetrics = new Set(metricTokens(quotes));
  for (const token of metricTokens(line)) {
    if (!metricAllowed(token, quoteMetrics)) {
      return `Metric “${token}” is not in the cited profile evidence.`;
    }
  }
  for (const term of findMentionedTerms(line, ctx.candidates)) {
    if (!skillAllowed(term, quotes, ctx)) {
      return `Skill or technology “${term}” is not in the cited evidence or the profile skill list.`;
    }
  }
  for (const match of line.matchAll(ORG_RE)) {
    const org = match[1]?.trim();
    if (!org) continue;
    const known =
      ctx.employers.some((employer) => employer === org) ||
      ctx.schools.some((school) => school === org) ||
      quotes.includes(org);
    if (!known) return `Employer or school “${org}” is not in the profile.`;
  }
  return null;
}

export function explainEmployer(employer: string, ctx: ValidationContext): string | null {
  const name = employer.trim();
  if (!name) return "Experience entry is missing an employer.";
  if (!ctx.employers.includes(name)) {
    return `Employer “${name}” is not exactly a profile employer.`;
  }
  return null;
}

export function explainSchool(school: string, ctx: ValidationContext): string | null {
  const name = school.trim();
  if (!name) return "Education entry is missing a school.";
  if (!ctx.schools.includes(name)) {
    return `School “${name}” is not exactly a profile school.`;
  }
  return null;
}

export function validateResumeDocument(
  resume: ResumeDocument,
  profile: CareerProfile,
  gaps: JdGap[] = resume.gaps,
): ResumeDocument {
  const ctx = createValidationContext(profile, gaps);
  const dropped = [...resume.validation.dropped];

  const keepLine = (text: string, evidenceIds: string[]) => {
    const reason = explainLineRejection(text, evidenceIds, ctx);
    if (!reason) return true;
    dropped.push({ text, reason, evidenceIds });
    return false;
  };

  const summary = keepLine(resume.summary.text, resume.summary.evidenceIds)
    ? resume.summary
    : { text: "", evidenceIds: [] };

  const skills = resume.skills.filter((skill) => keepLine(skill.text, skill.evidenceIds));

  const experience = resume.experience.flatMap((role) => {
    const employerReason = explainEmployer(role.employer, ctx);
    const header = [role.title, role.employer, role.location, role.dates].filter(Boolean).join(" · ");
    if (employerReason || !keepLine(header, role.evidenceIds)) {
      if (employerReason) dropped.push({ text: header, reason: employerReason, evidenceIds: role.evidenceIds });
      return [];
    }
    return [
      {
        ...role,
        bullets: role.bullets.filter((bullet) => keepLine(bullet.text, bullet.evidenceIds)),
      },
    ];
  });

  const education = resume.education.flatMap((item) => {
    const schoolReason = explainSchool(item.school, ctx);
    if (schoolReason || !keepLine(item.text, item.evidenceIds)) {
      if (schoolReason) {
        dropped.push({ text: item.text, reason: schoolReason, evidenceIds: item.evidenceIds });
      }
      return [];
    }
    return [item];
  });

  let headline = resume.headline;
  if (headline && !keepLine(headline, resume.contactEvidenceIds)) headline = "";
  let contactLine = resume.contactLine;
  if (contactLine && !keepLine(contactLine, resume.contactEvidenceIds)) contactLine = "";

  return {
    ...resume,
    headline,
    contactLine,
    summary,
    skills,
    experience,
    education,
    validation: { dropped },
  };
}
