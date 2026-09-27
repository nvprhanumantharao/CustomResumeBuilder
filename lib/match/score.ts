import type { JdAnalysis, JdGap } from "../jd/types";
import { collectEvidence } from "../profile/evidence";
import type { CareerProfile, EvidenceKind } from "../profile/types";
import { compactTerm, sameTerm, significantWords, termMentioned } from "../text";

export interface ScoredEvidence {
  evidenceId: string;
  kind: EvidenceKind;
  quote: string;
  label: string;
  score: number;
  matchedTerms: string[];
}

export interface SkillCoverage {
  matched: number;
  total: number;
}

export interface MatchSubScores {
  overallScore: number;
  skillsMatch: number;
  experienceMatch: number;
  domainMatch: number;
  matchedRequirements: string[];
  missingRequirements: string[];
}

export interface MatchResult {
  score: number;
  evidence: ScoredEvidence[];
  gaps: JdGap[];
  required: SkillCoverage;
  preferred: SkillCoverage;
  /** Required coverage is above 50% and preferred coverage is at least 25%. */
  qualified: boolean;
  subScores: MatchSubScores;
}

/** Required qualifications must match more than half of the list. */
export function requiredClearsBar(coverage: SkillCoverage): boolean {
  return coverage.total === 0 || coverage.matched * 2 > coverage.total;
}

/** Preferred qualifications must match at least a quarter of the list. */
export function preferredClearsBar(coverage: SkillCoverage): boolean {
  return coverage.total === 0 || coverage.matched * 4 >= coverage.total;
}

function covered(term: string, corpus: string): boolean {
  return termMentioned(corpus, term);
}

export function matchProfile(profile: CareerProfile, analysis: JdAnalysis): MatchResult {
  const evidence = collectEvidence(profile);
  const corpus = evidence.map((item) => item.quote).join("\n");
  const coveredRequired = new Set(
    analysis.requiredSkills.filter((skill) => covered(skill, corpus)).map(compactTerm),
  );
  const coveredPreferred = new Set(
    analysis.preferredSkills.filter((skill) => covered(skill, corpus)).map(compactTerm),
  );

  const gaps: JdGap[] = [];
  for (const skill of analysis.requiredSkills) {
    if (!coveredRequired.has(compactTerm(skill))) {
      gaps.push({ requirement: skill, kind: "required" });
    }
  }
  for (const skill of analysis.preferredSkills) {
    if (!coveredPreferred.has(compactTerm(skill))) {
      gaps.push({ requirement: skill, kind: "preferred" });
    }
  }
  const uncoveredSkills = [...analysis.requiredSkills, ...analysis.preferredSkills].filter(
    (skill) => !covered(skill, corpus),
  );
  for (const responsibility of analysis.responsibilities) {
    const mentionsUncovered = uncoveredSkills.some((skill) => termMentioned(responsibility, skill));
    const mentionsCovered = [...analysis.requiredSkills, ...analysis.preferredSkills].some(
      (skill) => covered(skill, corpus) && termMentioned(responsibility, skill),
    );
    if (mentionsUncovered) {
      gaps.push({ requirement: responsibility, kind: "responsibility" });
      continue;
    }
    if (!mentionsCovered) {
      const hits = significantWords(responsibility).filter((word) => termMentioned(corpus, word));
      if (hits.length === 0) {
        gaps.push({ requirement: responsibility, kind: "responsibility" });
      }
    }
  }

  const scored: ScoredEvidence[] = evidence.map((item) => {
    const matchedTerms: string[] = [];
    let score = 0;
    for (const skill of analysis.requiredSkills) {
      if (termMentioned(item.quote, skill)) {
        score += 3;
        matchedTerms.push(skill);
      }
    }
    for (const skill of analysis.preferredSkills) {
      if (termMentioned(item.quote, skill) && !matchedTerms.some((term) => sameTerm(term, skill))) {
        score += 2;
        matchedTerms.push(skill);
      }
    }
    for (const keyword of analysis.keywords) {
      if (keyword.length < 4) continue;
      if (termMentioned(item.quote, keyword) && !matchedTerms.some((term) => sameTerm(term, keyword))) {
        score += 0.5;
        matchedTerms.push(keyword);
      }
    }
    return {
      evidenceId: item.id,
      kind: item.kind,
      quote: item.quote,
      label: item.label,
      score,
      matchedTerms,
    };
  });

  const required: SkillCoverage = {
    matched: analysis.requiredSkills.filter((skill) => coveredRequired.has(compactTerm(skill))).length,
    total: analysis.requiredSkills.length,
  };
  const preferred: SkillCoverage = {
    matched: analysis.preferredSkills.filter((skill) => coveredPreferred.has(compactTerm(skill))).length,
    total: analysis.preferredSkills.length,
  };
  const denominator = required.total * 2 + preferred.total;
  const numerator = required.matched * 2 + preferred.matched;
  const score = denominator === 0 ? 0 : Math.round((100 * numerator) / denominator);
  const qualified =
    denominator > 0 && requiredClearsBar(required) && preferredClearsBar(preferred);

  const experienceCorpus = evidence
    .filter((item) => item.kind === "employment" || item.kind === "achievement")
    .map((item) => item.quote)
    .join("\n");
  const requiredInExperience = analysis.requiredSkills.filter((skill) => covered(skill, experienceCorpus));
  const experienceMatch =
    analysis.requiredSkills.length === 0
      ? 100
      : Math.round((100 * requiredInExperience.length) / analysis.requiredSkills.length);
  const meaningfulKeywords = analysis.keywords.filter((keyword) => keyword.length >= 4);
  const domainHits = meaningfulKeywords.filter((keyword) => termMentioned(corpus, keyword));
  const domainMatch =
    meaningfulKeywords.length === 0
      ? 100
      : Math.round((100 * domainHits.length) / meaningfulKeywords.length);
  const matchedRequirements = [
    ...analysis.requiredSkills.filter((skill) => coveredRequired.has(compactTerm(skill))),
    ...analysis.preferredSkills.filter((skill) => coveredPreferred.has(compactTerm(skill))),
  ];

  return {
    score,
    evidence: scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)),
    gaps,
    required,
    preferred,
    qualified,
    subScores: {
      overallScore: score,
      skillsMatch: score,
      experienceMatch,
      domainMatch,
      matchedRequirements,
      missingRequirements: gaps.map((gap) => gap.requirement),
    },
  };
}

export function scoreFor(match: MatchResult, evidenceId: string): number {
  return match.evidence.find((item) => item.evidenceId === evidenceId)?.score ?? 0;
}
