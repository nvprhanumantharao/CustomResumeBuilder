import type { CareerProfile, Education, Employment, EvidenceRef } from "./types";
import { CONTACT_ID, SUMMARY_ID } from "./types";

export function contactQuote(profile: CareerProfile): string {
  return [
    profile.name,
    profile.headline,
    profile.email,
    profile.phone,
    profile.location,
    ...profile.links,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
}

export function contactLine(profile: CareerProfile): string {
  return [profile.email, profile.phone, profile.location, ...profile.links]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export function employmentQuote(job: Employment): string {
  return [job.title, job.employer, job.location, job.start, job.end]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
}

export function roleHeader(job: Employment): string {
  const dates = [job.start, job.end]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" – ");
  return [job.title, job.employer, job.location, dates]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export function educationQuote(item: Education): string {
  return [item.degree, item.school, item.location, item.start, item.end, item.details]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
}

export function educationLine(item: Education): string {
  const dates = [item.start, item.end]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" – ");
  return [item.degree, item.school, dates].map((part) => part.trim()).filter(Boolean).join(", ");
}

export function collectEvidence(profile: CareerProfile): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];
  const contact = contactQuote(profile);
  if (contact) {
    evidence.push({
      id: CONTACT_ID,
      kind: "contact",
      quote: contact,
      source: "resume",
      label: profile.name || "Contact",
    });
  }
  if (profile.summary.trim()) {
    evidence.push({
      id: SUMMARY_ID,
      kind: "summary",
      quote: profile.summary.trim(),
      source: "resume",
      label: "Summary",
    });
  }
  for (const job of profile.employment) {
    const quote = employmentQuote(job);
    if (quote) {
      evidence.push({
        id: job.id,
        kind: "employment",
        quote,
        source: "resume",
        label: `${job.title} at ${job.employer}`.trim(),
      });
    }
    for (const achievement of job.achievements) {
      if (!achievement.text.trim()) continue;
      evidence.push({
        id: achievement.id,
        kind: "achievement",
        quote: achievement.text.trim(),
        source: "resume",
        label: job.employer || job.title || "Achievement",
      });
    }
  }
  for (const item of profile.education) {
    const quote = educationQuote(item);
    if (!quote) continue;
    evidence.push({
      id: item.id,
      kind: "education",
      quote,
      source: "resume",
      label: item.school || item.degree,
    });
  }
  for (const skill of profile.skills) {
    if (!skill.name.trim()) continue;
    evidence.push({
      id: skill.id,
      kind: "skill",
      quote: skill.name.trim(),
      source: "resume",
      label: skill.name.trim(),
    });
  }
  for (const cert of profile.certifications) {
    const quote = [cert.name, cert.issuer, cert.year]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" | ");
    if (!quote) continue;
    evidence.push({
      id: cert.id,
      kind: "certification",
      quote,
      source: "resume",
      label: cert.name,
    });
  }
  for (const project of profile.projects) {
    const quote = [project.name, project.description]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" | ");
    if (quote) {
      evidence.push({
        id: project.id,
        kind: "project",
        quote,
        source: "resume",
        label: project.name || "Project",
      });
    }
    for (const achievement of project.achievements) {
      if (!achievement.text.trim()) continue;
      evidence.push({
        id: achievement.id,
        kind: "achievement",
        quote: achievement.text.trim(),
        source: "resume",
        label: project.name || "Project",
      });
    }
  }
  return evidence;
}

export function employersOf(profile: CareerProfile): string[] {
  return profile.employment.map((job) => job.employer.trim()).filter(Boolean);
}

export function schoolsOf(profile: CareerProfile): string[] {
  return profile.education.map((item) => item.school.trim()).filter(Boolean);
}
