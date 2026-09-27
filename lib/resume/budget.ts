import type { ResumeDocument } from "./types";

/** About one US Letter page at the preview line width. */
const LINES_PER_PAGE = 40;
/** Keep two pages. Trim only after a third page of evidence. */
export const MAX_RESUME_LINES = LINES_PER_PAGE * 3;
const CHARS_PER_LINE = 90;

function textLines(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / CHARS_PER_LINE));
}

export function estimateLines(resume: ResumeDocument): number {
  let lines = 4;
  lines += 1 + textLines(resume.summary.text);
  lines += 1 + textLines(resume.skills.map((skill) => skill.text).join(", "));
  for (const role of resume.experience) {
    lines += 2;
    for (const bullet of role.bullets) lines += textLines(bullet.text);
  }
  if (resume.education.length > 0) {
    lines += 1;
    for (const item of resume.education) lines += textLines(item.text);
  }
  return lines;
}

export function fitResume(resume: ResumeDocument): ResumeDocument {
  const next: ResumeDocument = structuredClone(resume);
  let trimmed = 0;

  const tooLong = () => estimateLines(next) > MAX_RESUME_LINES;

  while (tooLong()) {
    let roleIndex = -1;
    let bulletIndex = -1;
    let lowest = Number.POSITIVE_INFINITY;
    next.experience.forEach((role, index) => {
      role.bullets.forEach((bullet, indexInRole) => {
        if (bullet.score < lowest || (bullet.score === lowest && indexInRole > bulletIndex)) {
          roleIndex = index;
          bulletIndex = indexInRole;
          lowest = bullet.score;
        }
      });
    });
    if (roleIndex >= 0 && bulletIndex >= 0) {
      next.experience[roleIndex]?.bullets.splice(bulletIndex, 1);
      trimmed += 1;
      if (next.experience.some((role) => role.bullets.length > 0)) {
        next.experience = next.experience.filter((role) => role.bullets.length > 0);
      }
      continue;
    }
    if (next.skills.length > 6) {
      next.skills.pop();
      continue;
    }
    if (next.summary.text.length > 180) {
      next.summary = {
        ...next.summary,
        text: next.summary.text.slice(0, 180).trim(),
      };
      continue;
    }
    break;
  }

  next.lineEstimate = estimateLines(next);
  next.trimmedBullets = trimmed;
  return next;
}
