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

export interface MatchResult {
  score: number;
  evidence: ScoredEvidence[];
  gaps: JdGap[];
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

  const denominator =
    analysis.requiredSkills.length * 2 + analysis.preferredSkills.length;
  const numerator =
    analysis.requiredSkills.filter((skill) => coveredRequired.has(compactTerm(skill))).length * 2 +
    analysis.preferredSkills.filter((skill) => coveredPreferred.has(compactTerm(skill))).length;
  const score = denominator === 0 ? 0 : Math.round((100 * numerator) / denominator);

  return {
    score,
    evidence: scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)),
    gaps,
  };
}

export function scoreFor(match: MatchResult, evidenceId: string): number {
  return match.evidence.find((item) => item.evidenceId === evidenceId)?.score ?? 0;
}
