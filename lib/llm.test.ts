import assert from "node:assert/strict";
import { mock, describe, it, beforeEach, afterEach } from "node:test";

const state: { output: unknown; error: Error | null; model: string } = {
  output: null,
  error: null,
  model: "",
};

mock.module("@ai-sdk/openai", {
  namedExports: {
    openai: (model: string) => {
      state.model = model;
      return { model };
    },
  },
});

mock.module("ai", {
  namedExports: {
    Output: {
      object: () => ({ schema: true }),
    },
    generateText: async () => {
      if (state.error) throw state.error;
      return { output: state.output };
    },
  },
});

const parsedProfile = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  location: "",
  links: ["https://example.com", ""],
  headline: "Mathematician",
  summary: "Wrote notes on the analytical engine.",
  employment: [
    {
      employer: "Analytical Engines",
      title: "Collaborator",
      location: "",
      start: "1843",
      end: "1843",
      achievements: ["Published notes.", ""],
    },
  ],
  education: [
    {
      school: "Home",
      degree: "Tutored",
      location: "",
      start: "",
      end: "",
      details: "",
    },
  ],
  skills: ["Mathematics", ""],
  certifications: [
    { name: "", issuer: "", year: "" },
    { name: "Note", issuer: "", year: "" },
  ],
  projects: [
    { name: "", description: "", achievements: [] },
    {
      name: "Notes",
      description: "Commentary",
      achievements: ["First algorithm.", ""],
    },
  ],
};

describe("OpenAI helpers", async () => {
  const { analyzeWithModel, hasOpenAIKey, parseWithModel, rewriteWithModel } =
    await import("./llm");
  const { sampleProfile } = await import("./profile/sample");
  const { analyzeJobHeuristic } = await import("./jd/analyze");
  const { matchProfile } = await import("./match/score");
  const { sampleJobDescription } = await import("./jd/sample");
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    state.output = null;
    state.error = null;
    state.model = "";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  });

  it("treats a missing or blank key as off", async () => {
    delete process.env.OPENAI_API_KEY;
    assert.equal(hasOpenAIKey(), false);
    assert.equal(await parseWithModel("resume text"), null);
    process.env.OPENAI_API_KEY = "   ";
    assert.equal(hasOpenAIKey(), false);
  });

  it("maps a model profile and ignores an empty extraction", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.OPENAI_MODEL;
    state.output = parsedProfile;
    const profile = await parseWithModel("Ada Lovelace resume");
    assert.equal(profile?.name, "Ada Lovelace");
    assert.deepEqual(profile?.links, ["https://example.com"]);
    assert.equal(profile?.employment[0]?.achievements.length, 1);
    assert.equal(profile?.skills.length, 1);
    assert.equal(profile?.certifications.length, 1);
    assert.equal(profile?.projects.length, 1);
    assert.equal(state.model, "gpt-4o-mini");

    state.output = {
      ...parsedProfile,
      employment: [],
      skills: [],
      summary: "  ",
    };
    assert.equal(await parseWithModel("empty"), null);
  });

  it("returns a job analysis only when the model found skills", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-test";
    state.output = {
      title: "Engineer",
      seniority: "Senior",
      domain: "Finance",
      requiredSkills: ["Go"],
      preferredSkills: [],
      responsibilities: [],
      keywords: ["Go"],
    };
    assert.equal((await analyzeWithModel("posting"))?.title, "Engineer");
    assert.equal(state.model, "gpt-test");
    state.output = { ...state.output, requiredSkills: [], preferredSkills: [] };
    assert.equal(await analyzeWithModel("posting"), null);
  });

  it("returns a rewrite and falls back when the model call throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const analysis = analyzeJobHeuristic(sampleJobDescription);
    const match = matchProfile(sampleProfile, analysis);
    state.output = {
      summary: { text: "Summary", evidenceIds: ["summary"] },
      skillIds: ["skill-ts"],
      bullets: [],
    };
    assert.equal(
      (await rewriteWithModel(sampleProfile, analysis, match))?.summary?.text,
      "Summary",
    );

    state.error = new Error("rate limit");
    const logged = mock.method(console, "error", () => {});
    assert.equal(await rewriteWithModel(sampleProfile, analysis, match), null);
    assert.equal(logged.mock.calls.length, 1);
    logged.mock.restore();
  });
});
