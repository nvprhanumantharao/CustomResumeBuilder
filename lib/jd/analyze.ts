import type { JdAnalysis } from "./types";
import { TECH_TERMS, significantWords, termMentioned, uniqueTerms } from "../text";

const SENIORITY = [
  "intern",
  "junior",
  "mid-level",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "director",
  "manager",
];

const DOMAINS = [
  "logistics",
  "fintech",
  "finance",
  "healthcare",
  "health care",
  "ecommerce",
  "e-commerce",
  "education",
  "climate",
  "security",
  "devtools",
  "infrastructure",
  "retail",
  "media",
  "insurance",
  "biotech",
];

const REQUIRED_HEADERS = [
  "required skills",
  "required",
  "requirements",
  "qualifications",
  "must have",
  "what you bring",
];
const PREFERRED_HEADERS = [
  "preferred skills",
  "preferred",
  "nice to have",
  "bonus",
  "pluses",
];
const RESPONSIBILITY_HEADERS = [
  "responsibilities",
  "responsibility",
  "what you'll do",
  "what you will do",
  "the role",
];

function headerKind(line: string): "required" | "preferred" | "responsibility" | null {
  const normalized = line
    .trim()
    .replace(/[:#]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!normalized || normalized.length > 48) return null;
  if (REQUIRED_HEADERS.includes(normalized)) return "required";
  if (PREFERRED_HEADERS.includes(normalized)) return "preferred";
  if (RESPONSIBILITY_HEADERS.includes(normalized)) return "responsibility";
  return null;
}

function bulletsOf(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function skillPhrases(section: string): string[] {
  const phrases: string[] = [];
  for (const line of bulletsOf(section)) {
    const pieces = line.split(/,|\/|\band\b|;/i).map((part) => part.trim());
    for (const piece of pieces) {
      const cleaned = piece.replace(/^\d+[.)]\s*/, "").trim();
      if (!cleaned || cleaned.length > 40) continue;
      if (cleaned.split(/\s+/).length > 4) continue;
      phrases.push(cleaned);
    }
  }
  for (const term of TECH_TERMS) {
    if (termMentioned(section, term)) phrases.push(term);
  }
  return uniqueTerms(phrases);
}

function labeled(text: string, label: string): string {
  const match = text.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function analyzeJobHeuristic(raw: string): JdAnalysis {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length < 20) {
    throw new Error("Paste a fuller job description, or use the sample posting.");
  }
  const lines = text.split("\n");
  const buckets: Record<"required" | "preferred" | "responsibility", string[]> = {
    required: [],
    preferred: [],
    responsibility: [],
  };
  let current: "required" | "preferred" | "responsibility" | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    const kind = headerKind(line);
    if (kind) {
      current = kind;
      continue;
    }
    if (!current) preamble.push(line);
    else buckets[current].push(line);
  }

  const requiredSection = buckets.required.join("\n");
  const preferredSection = buckets.preferred.join("\n");
  const responsibilitySection = buckets.responsibility.join("\n");

  let requiredSkills = skillPhrases(requiredSection);
  const preferredSkills = skillPhrases(preferredSection).filter(
    (skill) => !requiredSkills.some((required) => required.toLowerCase() === skill.toLowerCase()),
  );

  if (requiredSkills.length === 0 && preferredSkills.length === 0) {
    const found = TECH_TERMS.filter((term) => termMentioned(text, term));
    requiredSkills = uniqueTerms(found);
  }

  const responsibilities = bulletsOf(responsibilitySection).filter((line) => line.length > 12);

  const seniorityLabel = labeled(text, "seniority");
  const seniority =
    SENIORITY.find((level) => seniorityLabel.toLowerCase().includes(level)) ||
    SENIORITY.find((level) => new RegExp(`\\b${level}\\b`, "i").test(text)) ||
    "";

  const domainLabel = labeled(text, "domain");
  const domain =
    domainLabel ||
    DOMAINS.find((item) => new RegExp(`\\b${item}\\b`, "i").test(text)) ||
    "";

  const title =
    preamble.map((line) => line.trim()).find((line) => line && !/^domain:|^seniority:/i.test(line)) ||
    "Role";

  const keywordSource = [
    title,
    domain,
    seniority,
    ...responsibilities,
    ...requiredSkills,
    ...preferredSkills,
  ].join(" ");
  const keywords = uniqueTerms([
    ...requiredSkills,
    ...preferredSkills,
    ...significantWords(keywordSource).slice(0, 24),
  ]).slice(0, 32);

  return {
    title: title.replace(/^title\s*:\s*/i, "").trim(),
    seniority: seniority ? seniority[0]!.toUpperCase() + seniority.slice(1) : "",
    domain: domain ? domain[0]!.toUpperCase() + domain.slice(1) : "",
    requiredSkills,
    preferredSkills,
    responsibilities,
    keywords,
  };
}
