import type { JdAnalysis } from "../jd/types";
import { TECH_TERMS, metricTokens, sameTerm, significantWords, termMentioned, uniqueTerms } from "../text";
import { resumeBodyText } from "./plain";
import type { ResumeDocument } from "./types";

export interface AtsCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface AtsSkillHit {
  term: string;
  kind: "required" | "preferred";
  found: boolean;
}

/**
 * Match report for the finished resume, in the shape used by scanners such as
 * Jobscan and Teal: keywords in the submitted text, title alignment, and
 * whether a parser can read the contact and section fields.
 *
 * Weights, renormalized when a category has nothing to measure:
 * hard skills 55, other posting keywords 15, target title 10,
 * parse checks 15, measurable bullets 5.
 */
export interface AtsReport {
  score: number;
  hardSkills: { matched: number; total: number; hits: AtsSkillHit[] };
  keywords: { matched: number; total: number; missing: string[] };
  title: { label: string; ratio: number; detail: string };
  parse: { passed: number; total: number; checks: AtsCheck[] };
  measurable: { withMetrics: number; bullets: number };
}

const WEIGHTS = {
  hardSkills: 55,
  keywords: 15,
  title: 10,
  parse: 15,
  measurable: 5,
} as const;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;

function ratio(matched: number, total: number): number {
  if (total <= 0) return 0;
  return matched / total;
}

function weightedScore(parts: { weight: number; ratio: number }[]): number {
  const active = parts.filter((part) => part.weight > 0);
  const total = active.reduce((sum, part) => sum + part.weight, 0);
  if (total === 0) return 0;
  const value = active.reduce((sum, part) => sum + part.weight * part.ratio, 0);
  return Math.round((100 * value) / total);
}

function titleRatio(resume: ResumeDocument, title: string): { ratio: number; detail: string } {
  const cleaned = title.trim();
  const titles = [resume.headline, ...resume.experience.map((role) => role.title)]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
  if (!cleaned || sameTerm(cleaned, "role")) {
    return { ratio: 0, detail: "The posting has no target title to compare." };
  }
  if (!titles) {
    return { ratio: 0, detail: `No job title on the resume to compare with ${cleaned}.` };
  }
  if (termMentioned(titles, cleaned) || titles.toLowerCase().includes(cleaned.toLowerCase())) {
    return { ratio: 1, detail: `The resume title matches ${cleaned}.` };
  }
  const words = significantWords(cleaned);
  if (words.length === 0) {
    return { ratio: 0, detail: `The resume title does not match ${cleaned}.` };
  }
  const hit = words.filter((word) => termMentioned(titles, word)).length;
  const partial = hit / words.length;
  if (partial === 0) {
    return { ratio: 0, detail: `The resume title does not match ${cleaned}.` };
  }
  return {
    ratio: partial,
    detail: `Partial title match with ${cleaned}: ${hit} of ${words.length} words.`,
  };
}

function parseChecks(resume: ResumeDocument): AtsCheck[] {
  const datedRole = resume.experience.some(
    (role) => role.title.trim() && role.employer.trim() && YEAR_RE.test(role.dates),
  );
  const bulletCount = resume.experience.reduce((sum, role) => sum + role.bullets.length, 0);
  return [
    {
      label: "Name",
      passed: Boolean(resume.name.trim()),
      detail: resume.name.trim() ? "Name is in the header." : "Add a name so the parser can file the candidate.",
    },
    {
      label: "Email",
      passed: EMAIL_RE.test(resume.contactLine),
      detail: EMAIL_RE.test(resume.contactLine)
        ? "Email is in the contact line."
        : "Add an email in the contact line.",
    },
    {
      label: "Phone",
      passed: PHONE_RE.test(resume.contactLine),
      detail: PHONE_RE.test(resume.contactLine)
        ? "Phone is in the contact line."
        : "Add a phone number in the contact line.",
    },
    {
      label: "Skills",
      passed: resume.skills.some((skill) => skill.text.trim()),
      detail: resume.skills.some((skill) => skill.text.trim())
        ? "A skills section is present."
        : "Add a skills section. Parsers look for one by that heading.",
    },
    {
      label: "Dated role",
      passed: datedRole,
      detail: datedRole
        ? "A role has a title, employer, and year."
        : "Add a role with a title, employer, and a four-digit year.",
    },
    {
      label: "Bullets",
      passed: bulletCount > 0,
      detail:
        bulletCount > 0
          ? "Experience has accomplishment bullets."
          : "Add accomplishment bullets under each role.",
    },
    {
      label: "Education",
      passed: resume.education.some((item) => item.school.trim() || item.degree.trim()),
      detail: resume.education.some((item) => item.school.trim() || item.degree.trim())
        ? "An education section is present."
        : "Add an education section with a school or degree.",
    },
  ];
}

export function scoreAts(resume: ResumeDocument, analysis: JdAnalysis): AtsReport {
  const body = resumeBodyText(resume);
  const hits: AtsSkillHit[] = [
    ...analysis.requiredSkills.map((term) => ({
      term,
      kind: "required" as const,
      found: termMentioned(body, term),
    })),
    ...analysis.preferredSkills.map((term) => ({
      term,
      kind: "preferred" as const,
      found: termMentioned(body, term),
    })),
  ];
  const hardMatched =
    hits.filter((hit) => hit.kind === "required" && hit.found).length * 2 +
    hits.filter((hit) => hit.kind === "preferred" && hit.found).length;
  const hardTotal =
    hits.filter((hit) => hit.kind === "required").length * 2 +
    hits.filter((hit) => hit.kind === "preferred").length;

  const listedSkills = [...analysis.requiredSkills, ...analysis.preferredSkills];
  const extraKeywords = uniqueTerms(
    analysis.keywords.filter((keyword) => TECH_TERMS.some((term) => sameTerm(term, keyword))),
  ).filter((keyword) => !listedSkills.some((skill) => sameTerm(skill, keyword)));
  const missingKeywords = extraKeywords.filter((keyword) => !termMentioned(body, keyword));
  const keywordMatched = extraKeywords.length - missingKeywords.length;

  const title = titleRatio(resume, analysis.title);
  const checks = parseChecks(resume);
  const parsePassed = checks.filter((check) => check.passed).length;
  const bullets = resume.experience.flatMap((role) => role.bullets);
  const withMetrics = bullets.filter((bullet) => metricTokens(bullet.text).length > 0).length;

  const score = weightedScore([
    { weight: hardTotal > 0 ? WEIGHTS.hardSkills : 0, ratio: ratio(hardMatched, hardTotal) },
    {
      weight: extraKeywords.length > 0 ? WEIGHTS.keywords : 0,
      ratio: ratio(keywordMatched, extraKeywords.length),
    },
    {
      weight: analysis.title.trim() && !sameTerm(analysis.title, "role") ? WEIGHTS.title : 0,
      ratio: title.ratio,
    },
    { weight: WEIGHTS.parse, ratio: ratio(parsePassed, checks.length) },
    { weight: WEIGHTS.measurable, ratio: bullets.length === 0 ? 0 : ratio(withMetrics, bullets.length) },
  ]);

  return {
    score,
    hardSkills: {
      matched: hits.filter((hit) => hit.found).length,
      total: hits.length,
      hits,
    },
    keywords: {
      matched: keywordMatched,
      total: extraKeywords.length,
      missing: missingKeywords,
    },
    title: { label: analysis.title.trim(), ratio: title.ratio, detail: title.detail },
    parse: { passed: parsePassed, total: checks.length, checks },
    measurable: { withMetrics, bullets: bullets.length },
  };
}
