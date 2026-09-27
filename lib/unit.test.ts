import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeJobHeuristic } from "./jd/analyze";
import { sampleJobDescription } from "./jd/sample";
import { matchProfile, preferredClearsBar, requiredClearsBar, scoreFor } from "./match/score";
import {
  collectEvidence,
  contactLine,
  contactQuote,
  educationLine,
  employersOf,
  employmentQuote,
  roleHeader,
  schoolsOf,
} from "./profile/evidence";
import { createId } from "./profile/ids";
import { parseResumeHeuristic } from "./profile/parse";
import {
  blankProfile,
  sampleProfile,
  sampleResumeText,
} from "./profile/sample";
import { fitResume, estimateLines, MAX_RESUME_LINES } from "./resume/budget";
import { scoreAts } from "./resume/ats";
import { generateResume } from "./resume/generate";
import { accomplishmentXyz } from "./resume/xyz";
import { resumeBodyLines, resumeBodyText } from "./resume/plain";
import type { ResumeDocument } from "./resume/types";
import {
  createValidationContext,
  explainEmployer,
  explainLineRejection,
  explainSchool,
  validateResumeDocument,
} from "./resume/validate";
import { downloadName, errorResponse } from "./http";
import { clearDraft, loadDraft, normalizeProfile, saveDraft } from "./storage";
import {
  clipSentences,
  compactTerm,
  escapeRegExp,
  findMentionedTerms,
  metricAllowed,
  metricTokens,
  normalizeMetric,
  requirementMentioned,
  sameTerm,
  significantWords,
  termMentioned,
  uniqueTerms,
} from "./text";
import { cn } from "./utils";

function analysisOf(text: string) {
  return analyzeJobHeuristic(text);
}

function emptyResume(partial: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    name: "",
    headline: "",
    contactLine: "",
    contactEvidenceIds: [],
    summary: { text: "", evidenceIds: [] },
    skills: [],
    experience: [],
    education: [],
    gaps: [],
    validation: { dropped: [] },
    lineEstimate: 0,
    trimmedBullets: 0,
    mode: "heuristic",
    ...partial,
  };
}

describe("text helpers", () => {
  it("matches skill tokens without matching substrings", () => {
    assert.equal(termMentioned("I use Go daily", "Go"), true);
    assert.equal(termMentioned("going home", "Go"), false);
    assert.equal(termMentioned("see C++ and C#", "C++"), true);
    assert.equal(termMentioned("React Native apps", "React Native"), true);
    assert.equal(termMentioned("plain text", "   "), false);
    assert.equal(termMentioned("plain text", "---"), false);
    assert.equal(escapeRegExp("a+b"), "a\\+b");
    assert.equal(compactTerm("Node.js"), "nodejs");
    assert.equal(sameTerm("Node.js", "nodejs"), true);
  });

  it("treats long requirements as phrases and short ones as tokens", () => {
    assert.equal(requirementMentioned("knows Go", "Go"), true);
    assert.equal(requirementMentioned("", "   "), false);
    assert.equal(
      requirementMentioned(
        "Own the release platform",
        "Own the release platform",
      ),
      true,
    );
    assert.equal(
      requirementMentioned("Own a platform", "Own the release platform"),
      false,
    );
  });

  it("dedupes terms, metrics, and clips long sentences", () => {
    assert.deepEqual(significantWords("the strong team and latency"), [
      "latency",
    ]);
    assert.deepEqual(uniqueTerms([" Node.js ", "nodejs", "", "Go"]), [
      "Node.js",
      "Go",
    ]);
    assert.equal(normalizeMetric("$1,200"), "1200");
    assert.ok(metricTokens("from $12M to 480ms and 10%").includes("12m"));
    assert.equal(metricAllowed("480", new Set(["480ms"])), true);
    assert.equal(metricAllowed("999", new Set(["480"])), false);
    assert.equal(metricAllowed("note", new Set()), true);
    assert.deepEqual(
      findMentionedTerms("React Native and React", ["React", "React Native"]),
      ["React Native", "React"],
    );
    const clipped = clipSentences(
      `${"word ".repeat(20)}Done. ${"tail ".repeat(30)}`,
      120,
    );
    assert.ok(clipped.endsWith("Done."));
    assert.equal(clipSentences("short", 20), "short");
    const hard = clipSentences("x".repeat(200), 100);
    assert.equal(hard.length, 100);
  });
});

describe("http, ids, and class names", () => {
  it("builds error responses and download names", async () => {
    const response = errorResponse(new Error("nope"), 422);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "nope" });
    const fallback = errorResponse("bad");
    assert.equal(fallback.status, 400);
    assert.deepEqual(await fallback.json(), { error: "Something went wrong." });
    assert.equal(downloadName("  Maya Chen!! ", "pdf"), "maya-chen-resume.pdf");
    assert.equal(downloadName("***", "docx"), "resume-resume.docx");
    assert.match(createId("emp"), /^emp-/);
    assert.equal(typeof cn("a", "b"), "string");
  });
});

describe("draft storage", () => {
  it("no-ops when there is no window", () => {
    const previous = globalThis.window;
    // @ts-expect-error test the server branch
    delete globalThis.window;
    assert.equal(loadDraft(), null);
    saveDraft({
      step: 0,
      profile: null,
      sourceText: "",
      jdText: "",
      analysis: null,
      match: null,
      resume: null,
      mode: null,
      warnings: [],
    });
    clearDraft();
    globalThis.window = previous;
  });

  it("saves, fills missing profile arrays, and ignores corrupt drafts", () => {
    const memory = new Map<string, string>();
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => void memory.set(key, value),
        removeItem: (key: string) => void memory.delete(key),
      },
    } as unknown as Window & typeof globalThis;
    assert.equal(loadDraft(), null);
    const sparse = {
      ...blankProfile(),
      name: "Ada",
      links: undefined,
      employment: [
        { ...sampleProfile.employment[0]!, achievements: undefined },
      ],
      education: undefined,
      skills: undefined,
      certifications: undefined,
      projects: [{ ...sampleProfile.projects[0]!, achievements: undefined }],
    };
    const normalized = normalizeProfile(
      sparse as unknown as typeof sampleProfile,
    );
    assert.deepEqual(normalized.links, []);
    assert.deepEqual(normalized.employment[0]?.achievements, []);
    assert.deepEqual(normalized.projects[0]?.achievements, []);
    saveDraft({
      step: 1,
      profile: normalized,
      sourceText: "resume",
      jdText: "job",
      analysis: null,
      match: null,
      resume: null,
      mode: "heuristic",
      warnings: [],
    });
    assert.equal(loadDraft()?.profile?.name, "Ada");
    memory.set("evidence-resume-v1", "{");
    assert.equal(loadDraft(), null);
    clearDraft();
    assert.equal(memory.has("evidence-resume-v1"), false);
  });
});

describe("job analysis", () => {
  it("rejects a posting that is too short", () => {
    assert.throws(
      () => analyzeJobHeuristic("too short"),
      /fuller job description/,
    );
  });

  it("reads labeled sections, seniority, and domain", () => {
    const analysis = analysisOf(sampleJobDescription);
    assert.equal(analysis.title, "Staff Software Engineer");
    assert.equal(analysis.seniority, "Staff");
    assert.equal(analysis.domain, "Logistics");
    assert.ok(analysis.requiredSkills.includes("TypeScript"));
    assert.ok(analysis.preferredSkills.includes("React"));
    assert.equal(analysis.preferredSkills.includes("TypeScript"), false);
    assert.ok(
      analysis.responsibilities.some((line) => line.includes("PostgreSQL")),
    );
    assert.ok(analysis.keywords.length > 0);
  });

  it("falls back to technologies mentioned in an unstructured posting", () => {
    const analysis = analysisOf(
      "Title: Platform engineer\nSeniority: principal director\nDomain: fintech\nWe use Python, Docker, and AWS every day on this team.",
    );
    assert.equal(analysis.title, "Platform engineer");
    assert.equal(analysis.seniority, "Principal");
    assert.equal(analysis.domain, "Fintech");
    assert.ok(analysis.requiredSkills.includes("Python"));
    assert.ok(analysis.responsibilities.length === 0);
  });

  it("ignores skill fragments that are too long and duplicate preferred names", () => {
    const analysis = analysisOf(
      `Role\nRequired skills\n${"very long skill phrase that should be skipped entirely"}\nGo\nPreferred\nGo\nKafka\nResponsibilities\nhi\n- Ship the billing pipeline for invoices`,
    );
    assert.ok(analysis.requiredSkills.includes("Go"));
    assert.equal(
      analysis.preferredSkills
        .map((skill) => skill.toLowerCase())
        .includes("go"),
      false,
    );
    assert.equal(analysis.responsibilities.includes("hi"), false);
  });
});

describe("matching", () => {
  it("scores covered skills and records gaps", () => {
    const analysis = analysisOf(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    assert.ok(match.score > 0 && match.score <= 100);
    assert.ok(
      match.gaps.some(
        (gap) => gap.requirement === "Kubernetes" && gap.kind === "required",
      ),
    );
    assert.ok(scoreFor(match, "ach-nw-latency") > 0);
    assert.equal(scoreFor(match, "missing"), 0);
    assert.ok(match.evidence[0]!.score >= match.evidence.at(-1)!.score);
    assert.equal(match.required.matched, 3);
    assert.equal(match.required.total, 5);
    assert.equal(match.preferred.matched, 1);
    assert.equal(match.preferred.total, 3);
    assert.equal(match.qualified, true);
  });

  it("qualifies only when required coverage is above 50% and preferred coverage is at least 25%", () => {
    const base = {
      title: "Engineer",
      seniority: "",
      domain: "",
      responsibilities: [],
      keywords: [],
    };
    const halfRequired = matchProfile(sampleProfile, {
      ...base,
      requiredSkills: ["TypeScript", "Node.js", "Go", "Kubernetes"],
      preferredSkills: ["React", "Kafka", "Terraform", "Spark"],
    });
    assert.equal(halfRequired.required.matched, 2);
    assert.equal(halfRequired.required.total, 4);
    assert.equal(requiredClearsBar(halfRequired.required), false);
    assert.equal(preferredClearsBar(halfRequired.preferred), true);
    assert.equal(halfRequired.qualified, false);

    const lowPreferred = matchProfile(sampleProfile, {
      ...base,
      requiredSkills: ["TypeScript", "Node.js", "PostgreSQL"],
      preferredSkills: ["Kafka", "Terraform", "Spark", "Airflow"],
    });
    assert.equal(lowPreferred.preferred.matched, 0);
    assert.equal(lowPreferred.qualified, false);

    const clears = matchProfile(sampleProfile, {
      ...base,
      requiredSkills: ["TypeScript", "Node.js", "PostgreSQL", "Go"],
      preferredSkills: ["React", "Kafka", "Terraform", "Spark"],
    });
    assert.equal(clears.required.matched, 3);
    assert.equal(clears.preferred.matched, 1);
    assert.equal(clears.qualified, true);
  });

  it("returns zero when the posting has no skills and flags unsupported duties", () => {
    const analysis = analysisOf(
      "Office coordinator\nResponsibilities\n- Greet visitors at the front desk each morning\n- Order kitchen supplies for the office",
    );
    const match = matchProfile(sampleProfile, analysis);
    assert.equal(match.score, 0);
    assert.equal(match.qualified, false);
    assert.ok(match.gaps.length >= 1);
  });

  it("does not gap a duty whose words already appear in the profile", () => {
    const analysis = analysisOf(
      "Engineer\nRequired skills\nTypeScript\nResponsibilities\n- Improve TypeScript service latency for the API",
    );
    const match = matchProfile(sampleProfile, analysis);
    assert.equal(
      match.gaps.some((gap) => gap.requirement.includes("TypeScript service")),
      false,
    );
  });
});

describe("evidence and two-page budget", () => {
  it("collects contact, jobs, certs, and projects", () => {
    assert.ok(contactQuote(sampleProfile).includes("Maya Chen"));
    assert.ok(contactLine(sampleProfile).includes("maya.chen@example.com"));
    assert.ok(
      employmentQuote(sampleProfile.employment[0]!).includes("Northwind Labs"),
    );
    assert.ok(roleHeader(sampleProfile.employment[0]!).includes("2021"));
    assert.ok(
      educationLine(sampleProfile.education[0]!).includes(
        "University of Washington",
      ),
    );
    const evidence = collectEvidence(sampleProfile);
    assert.ok(evidence.some((item) => item.kind === "certification"));
    assert.ok(evidence.some((item) => item.kind === "project"));
    assert.deepEqual(employersOf(sampleProfile), [
      "Northwind Labs",
      "Harbor & Co",
    ]);
    assert.deepEqual(schoolsOf(sampleProfile), ["University of Washington"]);

    const empty = collectEvidence(blankProfile());
    assert.deepEqual(empty, []);
    const nameless = collectEvidence({
      ...blankProfile(),
      summary: "  ",
      employment: [
        {
          id: "emp",
          employer: "",
          title: "",
          location: "",
          start: "",
          end: "",
          achievements: [{ id: "ach", text: "   " }],
        },
      ],
      education: [
        {
          id: "edu",
          school: "",
          degree: "",
          location: "",
          start: "",
          end: "",
          details: "",
        },
      ],
      skills: [{ id: "skill", name: "  " }],
      certifications: [{ id: "cert", name: "", issuer: "", year: "" }],
      projects: [
        {
          id: "proj",
          name: "",
          description: "",
          achievements: [{ id: "pach", text: " " }],
        },
      ],
    });
    assert.deepEqual(nameless, []);
  });

  it("drops the lowest bullets, then extra skills, then shortens the summary", () => {
    const bullets = Array.from({ length: 40 }, (_, index) => ({
      text: `Bullet ${index} ${"detail ".repeat(40)}`,
      evidenceIds: ["ach"],
      score: index === 3 ? 0 : 5,
    }));
    const fitted = fitResume(
      emptyResume({
        name: "Ada Lovelace",
        summary: {
          text: `${"sentence ".repeat(40)}end.`,
          evidenceIds: ["summary"],
        },
        skills: Array.from({ length: 8 }, (_, index) => ({
          text: `Skill${index}`,
          evidenceIds: [`skill-${index}`],
        })),
        experience: [
          {
            employer: "Acme",
            title: "Engineer",
            location: "NY",
            dates: "2020 – 2024",
            evidenceIds: ["emp"],
            bullets,
          },
          {
            employer: "Other",
            title: "Engineer",
            location: "",
            dates: "",
            evidenceIds: ["emp-2"],
            bullets: [{ text: "kept", evidenceIds: ["ach-2"], score: 9 }],
          },
        ],
        education: [
          {
            text: "B.S. Somewhere",
            school: "Somewhere",
            degree: "B.S.",
            dates: "2010 – 2014",
            evidenceIds: ["edu"],
          },
        ],
      }),
    );
    assert.ok(fitted.trimmedBullets > 0);
    assert.ok(fitted.skills.length <= 8);
    assert.ok(fitted.lineEstimate <= MAX_RESUME_LINES || fitted.summary.text.length <= 180);
    assert.ok(estimateLines(fitted) === fitted.lineEstimate);
  });

  it("keeps roles and skills that still fit on two pages", () => {
    const roles = Array.from({ length: 22 }, (_, index) => ({
      employer: `Employer ${index}`,
      title: "Engineer",
      location: "",
      dates: "",
      evidenceIds: [`emp-${index}`],
      bullets: [] as ResumeDocument["experience"][number]["bullets"],
    }));
    const fitted = fitResume(
      emptyResume({
        summary: { text: "x".repeat(200), evidenceIds: ["summary"] },
        skills: Array.from({ length: 8 }, (_, index) => ({
          text: `S${index}`,
          evidenceIds: [`s${index}`],
        })),
        experience: roles,
      }),
    );
    assert.equal(fitted.trimmedBullets, 0);
    assert.equal(fitted.skills.length, 8);
    assert.ok(fitted.summary.text.length > 180);
    assert.ok(fitted.lineEstimate <= MAX_RESUME_LINES);
  });

  it("writes accomplishments with the XYZ formula", () => {
    const latency = accomplishmentXyz(
      "Cut API p95 latency from 480ms to 190ms by rewriting the Node.js request pipeline and adding PostgreSQL indexes.",
    );
    assert.match(latency, /^Accomplished /);
    assert.match(latency, /as measured by 480ms to 190ms/);
    assert.match(latency, /by doing rewriting the Node\.js request pipeline/);
    assert.doesNotMatch(latency, /999/);

    const squads = accomplishmentXyz(
      "Shipped a React and TypeScript design system used by 4 product squads.",
    );
    assert.match(squads, /as measured by 4 product squads/);

    const records = accomplishmentXyz(
      "Built a Python data quality checker that flagged 1,200 bad records a week before they reached finance.",
    );
    assert.match(records, /as measured by 1,200 bad records a week/);
    assert.match(records, /bad records/);
    assert.doesNotMatch(records, /1,200 b\b/);

    const analysis = analysisOf(sampleJobDescription);
    const resume = generateResume(sampleProfile, analysis, matchProfile(sampleProfile, analysis), null);
    const bullets = resume.experience.flatMap((role) => role.bullets.map((bullet) => bullet.text));
    assert.ok(bullets.length >= 4);
    assert.ok(bullets.every((bullet) => bullet.startsWith("Accomplished ")));
    assert.ok(bullets.every((bullet) => bullet.includes("as measured by") && bullet.includes("by doing")));
    assert.ok(resume.lineEstimate <= MAX_RESUME_LINES);
  });
});

describe("plain resume text", () => {
  it("skips blank lines", () => {
    const lines = resumeBodyLines(
      emptyResume({
        name: "  ",
        skills: [
          { text: "  ", evidenceIds: [] },
          { text: "Go", evidenceIds: ["skill"] },
        ],
        experience: [
          {
            employer: "",
            title: "",
            location: "",
            dates: "",
            evidenceIds: [],
            bullets: [
              { text: "  ", evidenceIds: [], score: 0 },
              { text: "Shipped it", evidenceIds: ["ach"] },
            ],
          },
        ],
        education: [
          { text: " ", school: "", degree: "", dates: "", evidenceIds: [] },
        ],
      }),
    );
    assert.deepEqual(
      lines.map((line) => line.text),
      ["Go", "Shipped it"],
    );
    assert.equal(resumeBodyText(emptyResume()), "");
  });
});

describe("resume parsing", () => {
  it("rejects text that is too short or has no usable sections", () => {
    assert.throws(
      () => parseResumeHeuristic("too short to parse"),
      /too short/,
    );
    assert.throws(
      () =>
        parseResumeHeuristic(
          "Just a name and nothing else at all in this blob of words.",
        ),
      /Could not find experience/,
    );
  });

  it("parses headings, links, certifications, and projects", () => {
    const { profile, warnings } = parseResumeHeuristic(
      sampleResumeText.replace(/\n/g, "\r\n"),
    );
    assert.equal(profile.name, "Maya Chen");
    assert.equal(profile.email, "maya.chen@example.com");
    assert.ok(profile.links.some((link) => link.includes("github.com")));
    assert.equal(profile.employment.length, 2);
    assert.equal(profile.certifications[0]?.year, "2022");
    assert.equal(profile.projects[0]?.name, "ledger-lint");
    assert.equal(profile.projects[0]?.achievements.length, 1);
    assert.ok(warnings.length >= 0);
  });

  it("reads labeled contact lines and alternate role formats", () => {
    const raw = `Name: Grace Hopper
Email: grace@example.com
Phone: 5551234567
Headline: Rear admiral
Location: Arlington, VA
https://github.com/grace
www.linkedin.com/in/grace
github.com/grace

Professional summary
Built compilers and taught COBOL to a generation of programmers worldwide.

Technical skills
COBOL, COBOL, grace@navy.mil, ${"an overly specific skill name that exceeds forty characters"}

Work history
Compiler lead at Navy 1952 – 1966
- Standardized COBOL across the service

Education
M.S. Mathematics | Yale University | New Haven, CT | 1930 – 1934
- Thesis on compilers

Certificates
- Navy commendation | US Navy | 1960

Selected projects
- skipped until a project exists
Flow-matic | Early compiled language
1. Shipped the first compiler demo
`;
    const { profile, warnings } = parseResumeHeuristic(raw);
    assert.equal(profile.name, "Grace Hopper");
    assert.equal(profile.email, "grace@example.com");
    assert.equal(profile.phone.includes("555"), true);
    assert.equal(profile.headline, "Rear admiral");
    assert.equal(profile.location, "Arlington, VA");
    assert.ok(profile.links.includes("https://github.com/grace"));
    assert.ok(
      profile.links.some((link) => link.startsWith("https://www.linkedin.com")),
    );
    assert.equal(
      profile.skills.some((skill) => skill.name === "COBOL"),
      true,
    );
    assert.equal(
      profile.skills.some((skill) => skill.name.includes("@")),
      false,
    );
    assert.equal(profile.employment[0]?.employer, "Navy");
    assert.equal(profile.employment[0]?.title, "Compiler lead");
    assert.ok(profile.employment[0]?.achievements[0]?.text.includes("COBOL"));
    assert.equal(profile.education[0]?.school, "Yale University");
    assert.ok(profile.education[0]?.details.includes("Thesis"));
    assert.equal(profile.certifications[0]?.issuer, "US Navy");
    assert.equal(profile.projects[0]?.name, "Flow-matic");
    assert.equal(warnings.length, 0);
  });

  it("warns when contact and skills are missing", () => {
    const { warnings, profile } = parseResumeHeuristic(
      `About
A long enough summary about building internal tools for operations teams.

Experience
Harbor Books - Analyst 2015-2019
This sentence is definitely longer than forty characters so it becomes an achievement.
`,
    );
    assert.equal(profile.employment[0]?.employer, "Harbor Books");
    assert.equal(profile.employment[0]?.title, "Analyst");
    assert.ok(profile.employment[0]?.achievements.length >= 1);
    assert.ok(warnings.some((warning) => warning.includes("email")));
    assert.ok(warnings.some((warning) => warning.includes("name")));
    assert.ok(warnings.some((warning) => warning.includes("skills")));
  });
});

describe("validation", () => {
  it("explains missing citations, gaps, metrics, skills, and unknown orgs", () => {
    const analysis = analysisOf(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const ctx = createValidationContext(sampleProfile, match.gaps);
    assert.equal(explainLineRejection("   ", ["contact"], ctx), null);
    assert.match(explainLineRejection("Hello", [], ctx) ?? "", /cite evidence/);
    assert.match(
      explainLineRejection("Hello", ["missing-id"], ctx) ?? "",
      /missing evidence/,
    );
    assert.match(
      explainLineRejection("Owned Kubernetes", ["ach-nw-latency"], ctx) ?? "",
      /Kubernetes/,
    );
    assert.match(
      explainLineRejection("Grew revenue by 999%", ["ach-nw-latency"], ctx) ??
        "",
      /999/,
    );
    assert.match(
      explainLineRejection("Introduced Haskell", ["ach-nw-latency"], ctx) ?? "",
      /Haskell/,
    );
    assert.match(
      explainLineRejection("Built tools at Initech", ["ach-nw-latency"], ctx) ??
        "",
      /Initech/,
    );
    assert.equal(
      explainLineRejection("Shipped the design system", ["ach-nw-design"], ctx),
      null,
    );
    assert.match(explainEmployer("  ", ctx) ?? "", /missing an employer/);
    assert.match(explainEmployer("Initech", ctx) ?? "", /Initech/);
    assert.equal(explainEmployer("Northwind Labs", ctx), null);
    assert.match(explainSchool("", ctx) ?? "", /missing a school/);
    assert.match(explainSchool("Other", ctx) ?? "", /Other/);
    assert.equal(explainSchool("University of Washington", ctx), null);
  });

  it("drops a bad headline, contact line, skill, and school", () => {
    const analysis = analysisOf(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const generated = generateResume(
      sampleProfile,
      analysis,
      match,
      null,
      "heuristic",
    );
    const poisoned = structuredClone(generated);
    poisoned.headline = "Kubernetes lead";
    poisoned.contactLine = "Built GraphQL at Initech";
    poisoned.skills.push({ text: "Haskell", evidenceIds: ["skill-ts"] });
    poisoned.education.push({
      text: "PhD, Other University",
      school: "Other University",
      degree: "PhD",
      dates: "2010 – 2014",
      evidenceIds: ["edu-uw"],
    });
    const cleaned = validateResumeDocument(poisoned, sampleProfile, match.gaps);
    assert.equal(cleaned.headline, "");
    assert.equal(cleaned.contactLine, "");
    assert.equal(
      cleaned.skills.some((skill) => skill.text === "Haskell"),
      false,
    );
    assert.equal(
      cleaned.education.some((item) => item.school === "Other University"),
      false,
    );
  });
});

describe("ATS score", () => {
  it("scores skills that appear in the resume text and flags the ones that do not", () => {
    const analysis = analysisOf(sampleJobDescription);
    const resume = generateResume(sampleProfile, analysis, matchProfile(sampleProfile, analysis), null);
    const ats = resume.ats ?? scoreAts(resume, analysis);
    assert.ok(ats.score > 0 && ats.score <= 100);
    assert.equal(ats.hardSkills.hits.find((hit) => hit.term === "TypeScript")?.found, true);
    assert.equal(ats.hardSkills.hits.find((hit) => hit.term === "Kubernetes")?.found, false);
    assert.equal(ats.hardSkills.hits.find((hit) => hit.term === "Go")?.found, false);
    assert.equal(ats.parse.passed, ats.parse.total);
    assert.ok(ats.measurable.withMetrics > 0);
    assert.match(ats.title.detail, /Partial title match/);
  });

  it("lowers the score when the submitted resume is missing parser fields", () => {
    const analysis = analysisOf(sampleJobDescription);
    const full = generateResume(sampleProfile, analysis, matchProfile(sampleProfile, analysis), null);
    const bare = scoreAts(
      emptyResume({
        name: "Maya Chen",
        summary: { text: "Engineer.", evidenceIds: [] },
      }),
      analysis,
    );
    assert.ok(full.ats);
    assert.ok(bare.score < full.ats.score);
    assert.equal(bare.parse.checks.find((check) => check.label === "Email")?.passed, false);
    assert.equal(bare.hardSkills.matched, 0);
  });
});

describe("resume generation", () => {
  it("uses a model rewrite when every line stays inside the evidence", () => {
    const analysis = analysisOf(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const resume = generateResume(sampleProfile, analysis, match, {
      summary: {
        text: "Engineer focused on TypeScript services, React products, Node.js APIs, and PostgreSQL.",
        evidenceIds: ["summary"],
      },
      skillIds: ["skill-ts", "skill-react"],
      bullets: [
        {
          text: "Shipped a React and TypeScript design system used by product squads.",
          evidenceIds: ["ach-nw-design"],
        },
        {
          text: "Combined the latency work and the design system rollout.",
          evidenceIds: ["ach-nw-latency", "ach-nw-design"],
        },
      ],
    });
    assert.equal(resume.mode, "openai");
    assert.ok(resumeBodyText(resume).includes("product squads"));
    assert.ok(resume.skills.some((skill) => skill.text === "TypeScript"));
    assert.ok(
      resume.experience[0]?.bullets.some(
        (bullet) => bullet.evidenceIds.length === 2,
      ),
    );
  });

  it("drops a rewrite that invents facts and falls back to the profile", () => {
    const analysis = analysisOf(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const resume = generateResume(
      {
        ...sampleProfile,
        summary: "Kubernetes expert who grew revenue by 999%.",
        headline: "Senior software engineer",
      },
      analysis,
      match,
      {
        summary: {
          text: "Moved the platform to Kubernetes and grew revenue by 999%.",
          evidenceIds: ["summary"],
        },
        skillIds: ["does-not-exist"],
        bullets: [
          { text: "   ", evidenceIds: ["ach-nw-latency"] },
          {
            text: "Introduced Haskell at a new employer.",
            evidenceIds: ["ach-nw-design"],
          },
          { text: "Invented a metric of 999%.", evidenceIds: ["missing"] },
        ],
      },
      "heuristic",
    );
    assert.equal(resume.mode, "heuristic");
    assert.equal(resumeBodyText(resume).includes("999"), false);
    assert.equal(
      requirementMentioned(resumeBodyText(resume), "Kubernetes"),
      false,
    );
    assert.ok(resume.validation.dropped.length > 0);
  });

  it("skips empty jobs and keeps certifications when there is room", () => {
    const analysis = analysisOf(
      "Support engineer\nRequired skills\nPython\nResponsibilities\n- Check data quality before finance import",
    );
    const profile = {
      ...blankProfile(),
      name: "Sam Lee",
      email: "sam@example.com",
      headline: "Support engineer",
      summary: "",
      skills: [{ id: "skill-py", name: "Python" }],
      certifications: [
        { id: "cert-empty", name: "  ", issuer: "", year: "" },
        {
          id: "cert-aws",
          name: "AWS Certified Cloud Practitioner",
          issuer: "Amazon",
          year: "2022",
        },
      ],
      employment: [
        {
          id: "emp-blank",
          employer: " ",
          title: " ",
          location: "",
          start: "",
          end: "",
          achievements: [],
        },
        {
          id: "emp-sam",
          employer: "Harbor & Co",
          title: "Analyst",
          location: "",
          start: "2018",
          end: "",
          achievements: [
            { id: "ach-empty", text: "  " },
            {
              id: "ach-py",
              text: "Built a Python data quality checker for finance.",
            },
          ],
        },
      ],
      education: [
        {
          id: "edu-1",
          school: "State College",
          degree: "B.A.",
          location: "",
          start: "2014",
          end: "2018",
          details: "",
        },
      ],
    };
    const match = matchProfile(profile, analysis);
    const resume = generateResume(profile, analysis, match, null);
    assert.equal(resume.mode, "heuristic");
    assert.ok(resume.skills.some((skill) => skill.text.includes("AWS")));
    assert.equal(resume.experience.length, 1);
    assert.ok(resume.summary.text.includes("Python"));
    assert.equal(resume.education[0]?.school, "State College");
  });
});
