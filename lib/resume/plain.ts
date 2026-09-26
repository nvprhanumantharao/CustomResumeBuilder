import type { ResumeDocument, ResumeLine } from "./types";

export function resumeBodyLines(resume: ResumeDocument): ResumeLine[] {
  const lines: ResumeLine[] = [];
  if (resume.name.trim()) {
    lines.push({ section: "Header", text: resume.name.trim(), evidenceIds: resume.contactEvidenceIds });
  }
  if (resume.headline.trim()) {
    lines.push({
      section: "Header",
      text: resume.headline.trim(),
      evidenceIds: resume.contactEvidenceIds,
    });
  }
  if (resume.contactLine.trim()) {
    lines.push({
      section: "Header",
      text: resume.contactLine.trim(),
      evidenceIds: resume.contactEvidenceIds,
    });
  }
  if (resume.summary.text.trim()) {
    lines.push({ section: "Summary", text: resume.summary.text.trim(), evidenceIds: resume.summary.evidenceIds });
  }
  for (const skill of resume.skills) {
    if (!skill.text.trim()) continue;
    lines.push({ section: "Skills", text: skill.text.trim(), evidenceIds: skill.evidenceIds });
  }
  for (const role of resume.experience) {
    const header = [role.title, role.employer, role.location, role.dates].filter(Boolean).join(" · ");
    if (header) {
      lines.push({ section: "Experience", text: header, evidenceIds: role.evidenceIds });
    }
    for (const bullet of role.bullets) {
      if (!bullet.text.trim()) continue;
      lines.push({ section: "Experience", text: bullet.text.trim(), evidenceIds: bullet.evidenceIds });
    }
  }
  for (const item of resume.education) {
    if (!item.text.trim()) continue;
    lines.push({ section: "Education", text: item.text.trim(), evidenceIds: item.evidenceIds });
  }
  return lines;
}

export function resumeBodyText(resume: ResumeDocument): string {
  return resumeBodyLines(resume)
    .map((line) => line.text)
    .join("\n");
}
