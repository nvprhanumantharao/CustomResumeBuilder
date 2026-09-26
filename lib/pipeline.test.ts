import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeJobHeuristic } from "./jd/analyze";
import { sampleJobDescription } from "./jd/sample";
import { matchProfile } from "./match/score";
import { collectEvidence } from "./profile/evidence";
import { parseResumeHeuristic } from "./profile/parse";
import { sampleProfile, sampleResumeText } from "./profile/sample";
import { generateResume } from "./resume/generate";
import { resumeBodyLines, resumeBodyText } from "./resume/plain";
import { validateResumeDocument } from "./resume/validate";
import { requirementMentioned } from "./text";
import { hasOpenAIKey } from "./llm";

function buildSample() {
  const analysis = analyzeJobHeuristic(sampleJobDescription);
  const match = matchProfile(sampleProfile, analysis);
  const resume = generateResume(
    sampleProfile,
    analysis,
    match,
    null,
    "heuristic",
  );
  return { analysis, match, resume };
}

describe("phase 1 heuristic pipeline", () => {
  it("runs with no OpenAI key", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    assert.equal(hasOpenAIKey(), false);
    const { resume } = buildSample();
    assert.equal(resume.mode, "heuristic");
    assert.ok(resumeBodyText(resume).includes("Northwind Labs"));
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("cites evidence on every line and leaves JD gaps out", () => {
    const { match, resume } = buildSample();
    const evidence = new Set(
      collectEvidence(sampleProfile).map((item) => item.id),
    );
    const lines = resumeBodyLines(resume);
    assert.ok(lines.length >= 8);
    for (const line of lines) {
      assert.ok(line.evidenceIds.length > 0, `missing citation: ${line.text}`);
      for (const id of line.evidenceIds) {
        assert.ok(evidence.has(id), `${id} on ${line.text}`);
      }
    }
    assert.ok(match.gaps.some((gap) => gap.requirement === "Kubernetes"));
    assert.ok(match.gaps.some((gap) => gap.requirement === "Go"));
    const body = resumeBodyText(resume);
    const excluded = match.gaps.filter(
      (gap) => !requirementMentioned(body, gap.requirement),
    );
    assert.ok(excluded.length >= 1);
    for (const gap of match.gaps) {
      assert.equal(
        requirementMentioned(body, gap.requirement),
        false,
        `gap leaked into resume: ${gap.requirement}`,
      );
    }
    assert.equal(body.includes("480ms"), true);
    assert.equal(body.includes("999"), false);
    assert.ok(
      resume.experience.every((role) =>
        ["Northwind Labs", "Harbor & Co"].includes(role.employer),
      ),
    );
  });

  it("drops a metric and a skill that are not in the profile", () => {
    const { match, resume } = buildSample();
    const poisoned = structuredClone(resume);
    const cited = poisoned.experience[0]?.bullets[0]?.evidenceIds[0];
    assert.ok(cited);
    poisoned.experience[0]?.bullets.push({
      text: "Grew revenue by 999% after moving the platform to Kubernetes.",
      evidenceIds: [cited],
      score: 99,
    });
    poisoned.experience.push({
      employer: "Initech",
      title: "CTO",
      location: "Austin, TX",
      dates: "2020 – 2024",
      evidenceIds: poisoned.experience[0]?.evidenceIds ?? [],
      bullets: [],
    });
    const cleaned = validateResumeDocument(poisoned, sampleProfile, match.gaps);
    const body = resumeBodyText(cleaned);
    assert.equal(body.includes("999"), false);
    assert.equal(requirementMentioned(body, "Kubernetes"), false);
    assert.equal(body.includes("Initech"), false);
    assert.equal(body.includes("480ms"), true);
    assert.ok(
      cleaned.validation.dropped.some((item) => item.text.includes("999")),
    );
  });

  it("rejects an invented metric even when the rewrite cites a real achievement", () => {
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    const resume = generateResume(sampleProfile, analysis, match, {
      bullets: [
        {
          text: "Grew revenue by 999% after adopting Kubernetes at a new employer.",
          evidenceIds: ["ach-nw-latency"],
        },
      ],
    });
    const body = resumeBodyText(resume);
    assert.equal(body.includes("999"), false);
    assert.equal(requirementMentioned(body, "Kubernetes"), false);
    assert.equal(body.includes("480ms"), true);
    assert.ok(
      resume.validation.dropped.some((item) => item.text.includes("999")),
    );
  });

  it("parses the sample resume text into the same facts", () => {
    const { profile, warnings } = parseResumeHeuristic(sampleResumeText);
    assert.equal(profile.name, "Maya Chen");
    assert.equal(profile.email, "maya.chen@example.com");
    assert.ok(
      profile.employment.some((job) => job.employer === "Northwind Labs"),
    );
    assert.ok(profile.employment.some((job) => job.employer === "Harbor & Co"));
    assert.ok(profile.skills.some((skill) => skill.name === "TypeScript"));
    assert.equal(profile.education[0]?.school, "University of Washington");
    const quotes = profile.employment
      .flatMap((job) => job.achievements.map((item) => item.text))
      .join(" ");
    assert.equal(quotes.includes("480ms"), true);
    assert.equal(quotes.includes("$12M"), true);
    assert.equal(quotes.includes("999"), false);
    assert.ok(warnings.length >= 0);
  });
});
