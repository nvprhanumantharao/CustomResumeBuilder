import type { JdAnalysis } from "../jd/types";
import type { MatchResult } from "../match/score";
import { scoreFor } from "../match/score";
import {
  contactLine,
  contactQuote,
  educationLine,
  employmentQuote,
  roleHeader,
} from "../profile/evidence";
import type { CareerProfile, Skill } from "../profile/types";
import { CONTACT_ID, SUMMARY_ID } from "../profile/types";
import { clipSentences, sameTerm, termMentioned } from "../text";
import { fitResume } from "./budget";
import type { GeneratorMode, ResumeDocument, ResumeEducation, ResumeRole, RewriteDraft } from "./types";
import {
  createValidationContext,
  explainEmployer,
  explainLineRejection,
  explainSchool,
} from "./validate";

const SKILL_CAP = 12;

function overlap(name: string, analysis: JdAnalysis): number {
  if (analysis.requiredSkills.some((skill) => sameTerm(skill, name))) return 3;
  if (analysis.preferredSkills.some((skill) => sameTerm(skill, name))) return 2;
  if (analysis.keywords.some((keyword) => termMentioned(name, keyword) || termMentioned(keyword, name))) {
    return 1;
  }
  return 0;
}

function orderedSkills(profile: CareerProfile, analysis: JdAnalysis, restrictTo?: string[]): Skill[] {
  const known = profile.skills.filter((skill) => skill.name.trim());
  const restricted =
    restrictTo && restrictTo.length > 0
      ? known.filter((skill) => restrictTo.includes(skill.id))
      : known;
  const source = restricted.length > 0 ? restricted : known;
  return [...source].sort((a, b) => {
    const delta = overlap(b.name, analysis) - overlap(a.name, analysis);
    if (delta !== 0) return delta;
    return known.findIndex((skill) => skill.id === a.id) - known.findIndex((skill) => skill.id === b.id);
  });
}

function fallbackSummary(profile: CareerProfile, analysis: JdAnalysis) {
  const matched = profile.skills.filter((skill) =>
    [...analysis.requiredSkills, ...analysis.preferredSkills].some((term) => sameTerm(term, skill.name)),
  );
  const names = matched.map((skill) => skill.name);
  const text = names.length
    ? `${profile.headline || profile.name}. ${names.join(", ")}.`
    : profile.headline || profile.summary || profile.name;
  return {
    text: text.trim(),
    evidenceIds: [CONTACT_ID, ...matched.map((skill) => skill.id)].filter(Boolean),
  };
}

export function generateResume(
  profile: CareerProfile,
  analysis: JdAnalysis,
  match: MatchResult,
  rewrite: RewriteDraft | null,
  mode: GeneratorMode = rewrite ? "openai" : "heuristic",
): ResumeDocument {
  const ctx = createValidationContext(profile, match.gaps);
  const dropped: ResumeDocument["validation"]["dropped"] = [];

  const summaryCandidate = profile.summary.trim()
    ? {
        text: clipSentences(profile.summary, 420),
        evidenceIds: [SUMMARY_ID],
      }
    : fallbackSummary(profile, analysis);

  let summary = summaryCandidate;
  if (rewrite?.summary?.text.trim()) {
    const reason = explainLineRejection(rewrite.summary.text, rewrite.summary.evidenceIds, ctx);
    if (reason) {
      dropped.push({
        text: rewrite.summary.text,
        reason,
        evidenceIds: rewrite.summary.evidenceIds,
      });
    } else {
      summary = {
        text: clipSentences(rewrite.summary.text, 420),
        evidenceIds: rewrite.summary.evidenceIds,
      };
    }
  }
  const summaryReason = explainLineRejection(summary.text, summary.evidenceIds, ctx);
  if (summaryReason) {
    dropped.push({ text: summary.text, reason: summaryReason, evidenceIds: summary.evidenceIds });
    const fallback = fallbackSummary(profile, analysis);
    const fallbackReason = explainLineRejection(fallback.text, fallback.evidenceIds, ctx);
    summary = fallbackReason ? { text: "", evidenceIds: [] } : fallback;
    if (fallbackReason) {
      dropped.push({ text: fallback.text, reason: fallbackReason, evidenceIds: fallback.evidenceIds });
    }
  }

  const skills = orderedSkills(profile, analysis, rewrite?.skillIds)
    .slice(0, SKILL_CAP)
    .map((skill) => ({ text: skill.name.trim(), evidenceIds: [skill.id] }))
    .filter((skill) => {
      const reason = explainLineRejection(skill.text, skill.evidenceIds, ctx);
      if (!reason) return true;
      dropped.push({ text: skill.text, reason, evidenceIds: skill.evidenceIds });
      return false;
    });

  for (const cert of profile.certifications) {
    if (skills.length >= SKILL_CAP) break;
    const text = cert.name.trim();
    if (!text) continue;
    const line = { text, evidenceIds: [cert.id] };
    const reason = explainLineRejection(line.text, line.evidenceIds, ctx);
    if (reason) {
      dropped.push({ text, reason, evidenceIds: line.evidenceIds });
      continue;
    }
    skills.push(line);
  }

  const usedBulletKeys = new Set<string>();
  const experience: ResumeRole[] = [];
  for (const job of profile.employment) {
    if (!job.employer.trim() || !job.title.trim()) continue;
    const employerReason = explainEmployer(job.employer, ctx);
    const header = roleHeader(job);
    const headerReason = explainLineRejection(header, [job.id], ctx);
    if (employerReason || headerReason) {
      dropped.push({
        text: header || job.employer,
        reason: employerReason || headerReason || "Employer was removed.",
        evidenceIds: [job.id],
      });
      continue;
    }
    if (!employmentQuote(job)) continue;

    const bullets = job.achievements.flatMap((achievement) => {
      const original = achievement.text.trim();
      if (!original) return [];
      const replacement = rewrite?.bullets?.find(
        (bullet) => bullet.evidenceIds.length === 1 && bullet.evidenceIds[0] === achievement.id,
      );
      let text = original;
      let evidenceIds = [achievement.id];
      if (replacement?.text.trim()) {
        const reason = explainLineRejection(replacement.text, replacement.evidenceIds, ctx);
        if (reason) {
          dropped.push({
            text: replacement.text,
            reason,
            evidenceIds: replacement.evidenceIds,
          });
        } else {
          text = replacement.text.trim();
          evidenceIds = replacement.evidenceIds;
        }
      }
      const reason = explainLineRejection(text, evidenceIds, ctx);
      if (reason) {
        dropped.push({ text, reason, evidenceIds });
        return [];
      }
      usedBulletKeys.add(evidenceIds.slice().sort().join("|"));
      return [
        {
          text,
          evidenceIds,
          score: scoreFor(match, achievement.id),
        },
      ];
    });

    experience.push({
      employer: job.employer.trim(),
      title: job.title.trim(),
      location: job.location.trim(),
      dates: [job.start, job.end].map((part) => part.trim()).filter(Boolean).join(" – "),
      evidenceIds: [job.id],
      bullets,
    });
  }

  for (const extra of rewrite?.bullets ?? []) {
    const key = extra.evidenceIds.slice().sort().join("|");
    if (!extra.text.trim() || extra.evidenceIds.length === 0 || usedBulletKeys.has(key)) continue;
    if (extra.evidenceIds.length === 1 && usedBulletKeys.has(extra.evidenceIds[0])) continue;
    const reason = explainLineRejection(extra.text, extra.evidenceIds, ctx);
    if (reason) {
      dropped.push({ text: extra.text, reason, evidenceIds: extra.evidenceIds });
      continue;
    }
    const job = profile.employment.find((item) =>
      item.achievements.some((achievement) => extra.evidenceIds.includes(achievement.id)),
    );
    const role = experience.find((item) => item.evidenceIds[0] === job?.id);
    if (!role) continue;
    role.bullets.push({
      text: extra.text.trim(),
      evidenceIds: extra.evidenceIds,
      score: Math.max(...extra.evidenceIds.map((id) => scoreFor(match, id)), 0),
    });
  }

  const education: ResumeEducation[] = [];
  for (const item of profile.education) {
    const text = educationLine(item);
    const schoolReason = explainSchool(item.school, ctx);
    const reason = explainLineRejection(text, [item.id], ctx);
    if (schoolReason || reason) {
      dropped.push({
        text,
        reason: schoolReason || reason || "Education was removed.",
        evidenceIds: [item.id],
      });
      continue;
    }
    education.push({
      text,
      school: item.school.trim(),
      degree: item.degree.trim(),
      dates: [item.start, item.end].map((part) => part.trim()).filter(Boolean).join(" – "),
      evidenceIds: [item.id],
    });
  }

  const contactEvidenceIds = contactQuote(profile) ? [CONTACT_ID] : [];
  const draft: ResumeDocument = {
    name: profile.name.trim(),
    headline: profile.headline.trim(),
    contactLine: contactLine(profile),
    contactEvidenceIds,
    summary,
    skills,
    experience,
    education,
    gaps: match.gaps,
    validation: { dropped },
    lineEstimate: 0,
    trimmedBullets: 0,
    mode,
  };

  return fitResume(draft);
}
