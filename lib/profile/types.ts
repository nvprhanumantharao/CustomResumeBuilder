export type EvidenceKind =
  | "contact"
  | "summary"
  | "employment"
  | "achievement"
  | "project"
  | "skill"
  | "certification"
  | "education";

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  quote: string;
  source: "resume";
  label: string;
}

export interface Achievement {
  id: string;
  text: string;
}

export interface Employment {
  id: string;
  employer: string;
  title: string;
  location: string;
  start: string;
  end: string;
  achievements: Achievement[];
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  details: string;
}

export interface Skill {
  id: string;
  name: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  achievements: Achievement[];
}

export interface CareerProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  headline: string;
  summary: string;
  employment: Employment[];
  education: Education[];
  skills: Skill[];
  certifications: Certification[];
  projects: Project[];
}

export const CONTACT_ID = "contact";
export const SUMMARY_ID = "summary";
