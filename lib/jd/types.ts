export interface JdAnalysis {
  title: string;
  seniority: string;
  domain: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  keywords: string[];
}

export interface JdGap {
  requirement: string;
  kind: "required" | "preferred" | "responsibility";
}
