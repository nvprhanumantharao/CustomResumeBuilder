import type { CareerProfile, Employment } from "./types";

export interface ParseResult {
  profile: CareerProfile;
  warnings: string[];
}

const SECTION_ALIASES: Record<string, string[]> = {
  summary: ["summary", "professional summary", "profile", "about", "objective"],
  skills: ["skills", "technical skills", "core skills", "technologies", "tech stack"],
  experience: [
    "experience",
    "work experience",
    "employment",
    "professional experience",
    "work history",
  ],
  education: ["education", "academics"],
  certifications: ["certifications", "certificates", "licenses", "certification"],
  projects: ["projects", "selected projects", "personal projects"],
};

const DATE_RANGE =
  /(\d{4})\s*[–—-]\s*(Present|Current|Now|\d{4})/i;

function normalizeHeader(line: string): string {
  return line
    .trim()
    .replace(/[:#]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function sectionKey(line: string): string | null {
  const normalized = normalizeHeader(line);
  if (!normalized || normalized.length > 40) return null;
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function splitSections(text: string): { header: string; sections: Map<string, string> } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  const header: string[] = [];
  for (const line of lines) {
    const key = sectionKey(line);
    if (key) {
      current = key;
      if (!sections.has(key)) sections.set(key, []);
      continue;
    }
    if (!current) header.push(line);
    else sections.get(current)?.push(line);
  }
  const joined = new Map<string, string>();
  for (const [key, value] of sections) joined.set(key, value.join("\n").trim());
  return { header: header.join("\n").trim(), sections: joined };
}

function firstMatch(text: string, re: RegExp): string {
  return text.match(re)?.[0]?.trim() ?? "";
}

function looksLikeName(line: string): boolean {
  const cleaned = line.trim();
  if (!cleaned || cleaned.length > 60) return false;
  if (/[@|]|\d/.test(cleaned)) return false;
  const words = cleaned.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word));
}

function parseHeader(header: string): Pick<
  CareerProfile,
  "name" | "email" | "phone" | "location" | "links" | "headline"
> {
  const lines = header
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blob = lines.join("\n");
  const labeled = (label: string) => {
    const match = blob.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() ?? "";
  };
  const email = labeled("email") || firstMatch(blob, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phone =
    labeled("phone") ||
    firstMatch(blob, /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  const links = [
    ...blob.matchAll(/https?:\/\/[^\s)]+/gi),
    ...blob.matchAll(/(?<![\w@])((?:www\.)?(?:github|linkedin)\.com\/[^\s)]+)/gi),
  ].map((match) => match[0]);
  const uniqueLinks = [...new Set(links.map((link) => (link.startsWith("http") ? link : `https://${link}`)))];

  let name = labeled("name");
  let headline = labeled("headline");
  let location = labeled("location");

  const consumed = new Set<string>();
  if (!name) {
    const nameLine = lines.find((line) => looksLikeName(line));
    if (nameLine) {
      name = nameLine;
      consumed.add(nameLine);
    }
  }
  if (!headline) {
    const headlineLine = lines.find(
      (line) =>
        !consumed.has(line) &&
        line !== name &&
        !line.includes(email) &&
        !line.includes("@") &&
        !/^https?:/i.test(line) &&
        !/\d/.test(line) &&
        !/,\s*[A-Z]{2}\b/.test(line) &&
        line.length <= 80 &&
        !DATE_RANGE.test(line),
    );
    if (headlineLine && headlineLine !== location) {
      headline = headlineLine;
      consumed.add(headlineLine);
    }
  }
  if (!location) {
    const locationLine = lines.find(
      (line) =>
        !consumed.has(line) &&
        line !== name &&
        /,\s*[A-Z]{2}\b/.test(line) &&
        !line.includes("@"),
    );
    if (locationLine) location = locationLine.replace(/\s*·.*$/, "").trim();
  }

  return {
    name,
    email,
    phone,
    location,
    links: uniqueLinks,
    headline,
  };
}

function splitBlocks(section: string): string[][] {
  const lines = section.split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.some((line) => line.trim())) blocks.push(current);
    current = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    current.push(line.trim());
  }
  flush();
  return blocks;
}

function isBullet(line: string): boolean {
  return /^([-*•]|\d+[.)])\s+/.test(line.trim());
}

function bulletText(line: string): string {
  return line.trim().replace(/^([-*•]|\d+[.)])\s+/, "").trim();
}

function parseDates(segment: string): { start: string; end: string; rest: string } {
  const match = segment.match(DATE_RANGE);
  if (!match) return { start: "", end: "", rest: segment.trim() };
  return {
    start: match[1] ?? "",
    end: match[2] ?? "",
    rest: segment.replace(match[0], "").replace(/[|·,—–-]+/g, " ").trim(),
  };
}

function parseRoleHeader(line: string): Pick<
  Employment,
  "employer" | "title" | "location" | "start" | "end"
> | null {
  if (isBullet(line)) return null;
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const dates = parseDates(parts[parts.length - 1] ?? "");
    const location =
      parts.length >= 4
        ? parts[2] ?? ""
        : parts.length === 3 && !DATE_RANGE.test(parts[2] ?? "")
          ? parts[2] ?? ""
          : "";
    const employer = parts[1] ?? "";
    const title = parts[0] ?? "";
    if (!employer || !title) return null;
    return {
      title,
      employer: employer.replace(DATE_RANGE, "").trim(),
      location: location.replace(DATE_RANGE, "").trim(),
      start: dates.start || parseDates(line).start,
      end: dates.end || parseDates(line).end,
    };
  }

  const dates = parseDates(line);
  if (!dates.start && !/[-–—]/.test(line)) return null;
  const withoutDates = line.replace(DATE_RANGE, "").trim();
  const atMatch = withoutDates.match(/^(.+?)\s+at\s+(.+)$/i);
  const dashMatch = withoutDates.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (atMatch) {
    return {
      title: atMatch[1]?.trim() ?? "",
      employer: atMatch[2]?.trim() ?? "",
      location: "",
      start: dates.start,
      end: dates.end,
    };
  }
  if (dashMatch) {
    return {
      employer: dashMatch[1]?.trim() ?? "",
      title: dashMatch[2]?.trim() ?? "",
      location: "",
      start: dates.start,
      end: dates.end,
    };
  }
  return null;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function parseExperience(section: string): Employment[] {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const jobs: Employment[] = [];
  let current: Employment | null = null;

  const pushBullet = (text: string) => {
    if (!current || !text) return;
    current.achievements.push({ id: nextId("ach"), text });
  };

  for (const line of lines) {
    const header = !isBullet(line) ? parseRoleHeader(line) : null;
    if (header && header.employer && header.title) {
      current = {
        id: nextId("emp"),
        ...header,
        achievements: [],
      };
      jobs.push(current);
      continue;
    }
    if (isBullet(line)) {
      pushBullet(bulletText(line));
      continue;
    }
    if (current && line.length > 40) pushBullet(line);
  }
  return jobs.filter((job) => job.employer && job.title);
}

function parseSkills(section: string): { id: string; name: string }[] {
  const chunks = section
    .split(/[\n,;•|]/)
    .map((part) => part.replace(/^[-*]\s*/, "").trim())
    .filter((part) => part && part.length <= 40 && !part.includes("@"));
  const seen = new Set<string>();
  const skills: { id: string; name: string }[] = [];
  for (const name of chunks) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({ id: nextId("skill"), name });
  }
  return skills;
}

function parseEducation(section: string) {
  const blocks = splitBlocks(section);
  const source = blocks.length > 0 ? blocks : [section.split("\n").map((line) => line.trim())];
  return source
    .map((block) => {
      const line = block.filter((item) => !isBullet(item)).join(" | ");
      const parts = (block.length === 1 ? block[0] ?? "" : line)
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      const dates = parseDates(parts[parts.length - 1] ?? line);
      const degree = parts[0] ?? "";
      const school = parts[1] ?? "";
      if (!school && !degree) return null;
      return {
        id: nextId("edu"),
        degree: degree.replace(DATE_RANGE, "").trim(),
        school: school.replace(DATE_RANGE, "").trim(),
        location: (parts[2] && !DATE_RANGE.test(parts[2]) ? parts[2] : "").replace(DATE_RANGE, "").trim(),
        start: dates.start,
        end: dates.end,
        details: block.filter(isBullet).map(bulletText).join(" "),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item && (item.school || item.degree)));
}

function parseCertifications(section: string) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !sectionKey(line))
    .map((line) => bulletText(line))
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        id: nextId("cert"),
        name: parts[0] ?? line,
        issuer: parts[1] ?? "",
        year: (parts[2] ?? parts[1] ?? "").match(/\d{4}/)?.[0] ?? "",
      };
    })
    .filter((item) => item.name);
}

function parseProjects(section: string) {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const projects: CareerProfile["projects"] = [];
  let current: CareerProfile["projects"][number] | null = null;
  for (const line of lines) {
    if (isBullet(line)) {
      if (!current) continue;
      current.achievements.push({ id: nextId("pach"), text: bulletText(line) });
      continue;
    }
    const parts = line.split("|").map((part) => part.trim());
    current = {
      id: nextId("proj"),
      name: parts[0] ?? line,
      description: parts[1] ?? "",
      achievements: [],
    };
    projects.push(current);
  }
  return projects.filter((project) => project.name);
}

export function parseResumeHeuristic(raw: string): ParseResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length < 40) {
    throw new Error("That text is too short to parse. Paste a fuller resume or use the sample profile.");
  }
  idCounter = 0;
  const { header, sections } = splitSections(text);
  const contact = parseHeader(header);
  const summary = (sections.get("summary") ?? "").replace(/\s+/g, " ").trim();
  const profile: CareerProfile = {
    ...contact,
    summary,
    employment: parseExperience(sections.get("experience") ?? ""),
    education: parseEducation(sections.get("education") ?? ""),
    skills: parseSkills(sections.get("skills") ?? ""),
    certifications: parseCertifications(sections.get("certifications") ?? ""),
    projects: parseProjects(sections.get("projects") ?? ""),
  };

  const warnings: string[] = [];
  if (!profile.email) warnings.push("No email found. Add one before you export.");
  if (!profile.name) warnings.push("No name found. Add it in the profile editor.");
  if (profile.employment.length === 0) {
    warnings.push("No experience section found. Add employers manually or check the headings.");
  }
  if (profile.skills.length === 0) {
    warnings.push("No skills section found. Add skills so the match can use them.");
  }
  if (profile.employment.length === 0 && profile.skills.length === 0 && !profile.summary) {
    throw new Error(
      "Could not find experience, skills, or a summary. Use headings like EXPERIENCE and SKILLS, or load the sample profile.",
    );
  }
  return { profile, warnings };
}
