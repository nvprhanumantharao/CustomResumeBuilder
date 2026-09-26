/** Shared text helpers for parsing, matching, and fact checks. */

export const TECH_TERMS = [
  "TypeScript",
  "JavaScript",
  "React",
  "React Native",
  "Next.js",
  "Node.js",
  "PostgreSQL",
  "Postgres",
  "Python",
  "Kubernetes",
  "Terraform",
  "Kafka",
  "GraphQL",
  "Go",
  "Golang",
  "AWS",
  "Docker",
  "Redis",
  "MongoDB",
  "Java",
  "C#",
  "C++",
  "Ruby",
  "Rust",
  "Scala",
  "Angular",
  "Vue",
  "Express.js",
  "Django",
  "Flask",
  "FastAPI",
  "Spring Boot",
  "GCP",
  "Azure",
  "MySQL",
  "SQLite",
  "REST",
  "gRPC",
  "HTML",
  "CSS",
  "Sass",
  "Linux",
  "Git",
  "CI/CD",
  "Jenkins",
  "Snowflake",
  "Apache Spark",
  "Airflow",
  "Elasticsearch",
  "RabbitMQ",
  "Nginx",
  "Prisma",
  "Redux",
  "PHP",
  "Laravel",
  "Ruby on Rails",
  "TensorFlow",
  "PyTorch",
  "Pandas",
  "Salesforce",
  "Oracle",
  "DynamoDB",
  "Microservices",
  "Tailwind CSS",
  "Swift",
  "Kotlin",
  "Flutter",
  "Haskell",
  "Scala",
  "Perl",
  "MATLAB",
  "R",
  "Tableau",
  "Figma",
  "Jira",
  "Kubernetes",
];

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "over",
  "our",
  "you",
  "your",
  "we",
  "who",
  "their",
  "they",
  "are",
  "was",
  "were",
  "be",
  "on",
  "in",
  "of",
  "to",
  "as",
  "by",
  "at",
  "it",
  "is",
  "per",
  "via",
  "using",
  "use",
  "used",
  "across",
  "within",
  "including",
  "include",
  "such",
  "other",
  "than",
  "then",
  "not",
  "but",
  "about",
  "after",
  "before",
  "during",
  "without",
  "team",
  "teams",
  "work",
  "working",
  "role",
  "job",
  "will",
  "can",
  "ability",
  "strong",
  "experience",
  "experienced",
  "years",
  "year",
  "plus",
  "must",
  "have",
  "has",
  "been",
  "being",
  "their",
  "them",
  "what",
  "when",
  "where",
  "which",
  "while",
  "also",
  "more",
  "most",
  "some",
  "any",
  "all",
  "new",
  "own",
  "able",
]);

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compactTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, "");
}

/** True when `term` appears in `text` as a skill-like token, not as a substring of another word. */
export function termMentioned(text: string, term: string): boolean {
  const cleaned = term.trim();
  if (!cleaned) return false;
  const parts = cleaned.split(/[^a-z0-9+#]+/i).filter(Boolean);
  if (parts.length === 0) return false;
  const pattern = parts.map(escapeRegExp).join("[^a-z0-9+#]*");
  const re = new RegExp(`(?<![A-Za-z0-9+#])${pattern}(?![A-Za-z0-9+#])`, "i");
  return re.test(text);
}

export function sameTerm(a: string, b: string): boolean {
  return compactTerm(a) === compactTerm(b);
}

/**
 * Long requirements must appear verbatim. Short skill names use token matching.
 * Loose token joins would treat a sentence as "in" the resume if its words show up in order.
 */
export function requirementMentioned(text: string, requirement: string): boolean {
  const words = requirement.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length <= 3) return termMentioned(text, requirement);
  return text.toLowerCase().includes(requirement.trim().toLowerCase());
}

export function significantWords(value: string): string[] {
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  return [...new Set(words)];
}

export function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const cleaned = term.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = compactTerm(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

const METRIC_RE = /\$?\d[\d,]*(?:\.\d+)?%?(?:\s?[kmb])?/gi;

export function normalizeMetric(raw: string): string {
  return raw.toLowerCase().replace(/[$,\s]/g, "");
}

export function metricTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(METRIC_RE)) {
    const token = normalizeMetric(match[0] ?? "");
    if (token && /\d/.test(token)) tokens.add(token);
  }
  return [...tokens];
}

export function metricAllowed(token: string, quoteTokens: Set<string>): boolean {
  if (quoteTokens.has(token)) return true;
  const digits = token.replace(/[^\d.]/g, "");
  if (!digits) return true;
  for (const quote of quoteTokens) {
    if (quote.replace(/[^\d.]/g, "") === digits) return true;
  }
  return false;
}

export function findMentionedTerms(text: string, candidates: string[]): string[] {
  const found: string[] = [];
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  let masked = text;
  for (const term of sorted) {
    if (!termMentioned(masked, term)) continue;
    found.push(term);
    const parts = term.trim().split(/[^a-z0-9+#]+/i).filter(Boolean);
    if (parts.length === 0) continue;
    const pattern = parts.map(escapeRegExp).join("[^a-z0-9+#]*");
    masked = masked.replace(
      new RegExp(`(?<![A-Za-z0-9+#])${pattern}(?![A-Za-z0-9+#])`, "gi"),
      " ",
    );
  }
  return found;
}

export function clipSentences(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastStop > 80) return slice.slice(0, lastStop + 1).trim();
  return slice.trim();
}
