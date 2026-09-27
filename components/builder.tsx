"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ProfileEditor } from "@/components/profile-editor";
import { ResumePreview } from "@/components/resume-preview";
import type { JdAnalysis } from "@/lib/jd/types";
import { sampleJobDescription } from "@/lib/jd/sample";
import type { MatchResult } from "@/lib/match/score";
import type { CareerProfile } from "@/lib/profile/types";
import { sampleProfile, sampleResumeText } from "@/lib/profile/sample";
import { resumeBodyLines } from "@/lib/resume/plain";
import type { GeneratorMode, ResumeDocument } from "@/lib/resume/types";
import { clearDraft, loadDraft, saveDraft } from "@/lib/storage";

const STEPS = [
  { id: 0, label: "Profile", hint: "Source facts" },
  { id: 1, label: "Job", hint: "The posting" },
  { id: 2, label: "Match", hint: "Evidence and gaps" },
  { id: 3, label: "Resume", hint: "Two pages" },
] as const;

type Busy = null | "parse" | "analyze" | "generate" | "pdf" | "docx";

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || "The request failed.";
}

function ScoreExplanation({ match }: { match: MatchResult }) {
  if (!match.required || !match.preferred) {
    return (
      <p className="mt-3 text-sm text-muted-foreground" data-testid="score-reasons">
        Analyze the job again to see why this score was given.
      </p>
    );
  }

  const { required, preferred } = match;
  const denominator = required.total * 2 + preferred.total;
  const numerator = required.matched * 2 + preferred.matched;
  const headline =
    denominator === 0
      ? "No required or preferred skills were found, so the score is 0."
      : numerator === 0
        ? "None of the job skills are in your profile, so the score is 0."
        : `${required.matched} required and ${preferred.matched} preferred matched.`;
  const bar =
    denominator === 0
      ? "Responsibilities and keywords are not counted."
      : match.qualified
        ? "Clears the bar."
        : "Below the bar.";

  return (
    <div className="mt-4 grid gap-3" data-testid="score-reasons">
      <p className="text-sm">{headline}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Required</dt>
          <dd className="text-sm">{required.total === 0 ? "None listed" : `${required.matched} of ${required.total}`}</dd>
          <dd className="text-xs text-muted-foreground">Need above 50%</dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Preferred</dt>
          <dd className="text-sm">{preferred.total === 0 ? "None listed" : `${preferred.matched} of ${preferred.total}`}</dd>
          <dd className="text-xs text-muted-foreground">Need at least 25%</dd>
        </div>
      </dl>
      {denominator > 0 ? (
        <p className="text-sm text-muted-foreground">
          Required counts double. ({required.matched}×2 + {preferred.matched}) / ({required.total}×2 + {preferred.total}) = {match.score}.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{bar}</p>
    </div>
  );
}

export function Builder() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [jdText, setJdText] = useState("");
  const [analysis, setAnalysis] = useState<JdAnalysis | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [resume, setResume] = useState<ResumeDocument | null>(null);
  const [mode, setMode] = useState<GeneratorMode | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [stale, setStale] = useState(false);
  const resumeFile = useRef<HTMLInputElement>(null);
  const jobFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      // Hydrate from localStorage after mount so server and client markup match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(saved.step ?? 0);
      setProfile(saved.profile);
      setSourceText(saved.sourceText ?? "");
      setJdText(saved.jdText ?? "");
      setAnalysis(saved.analysis);
      setMatch(saved.match);
      setResume(saved.resume);
      setMode(saved.mode);
      setWarnings(saved.warnings ?? []);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft({ step, profile, sourceText, jdText, analysis, match, resume, mode, warnings });
  }, [hydrated, step, profile, sourceText, jdText, analysis, match, resume, mode, warnings]);

  const citations = useMemo(() => (resume ? resumeBodyLines(resume) : []), [resume]);
  const matchedEvidence = useMemo(
    () => (match ? match.evidence.filter((item) => item.score > 0).slice(0, 8) : []),
    [match],
  );

  function resetAll() {
    clearDraft();
    setStep(0);
    setProfile(null);
    setSourceText("");
    setJdText("");
    setAnalysis(null);
    setMatch(null);
    setResume(null);
    setMode(null);
    setWarnings([]);
    setError(null);
    setStale(false);
  }

  function updateProfile(next: CareerProfile) {
    setProfile(next);
    setResume(null);
    setStale(Boolean(analysis));
  }

  function useSampleProfile() {
    setProfile(structuredClone(sampleProfile));
    setSourceText(sampleResumeText);
    setAnalysis(null);
    setMatch(null);
    setResume(null);
    setWarnings([]);
    setError(null);
    setStale(false);
  }

  function useSampleJob() {
    setJdText(sampleJobDescription);
    setAnalysis(null);
    setMatch(null);
    setResume(null);
    setError(null);
    setStale(false);
  }

  async function parseText(text: string) {
    setBusy("parse");
    setError(null);
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as {
        profile: CareerProfile;
        warnings: string[];
        mode: GeneratorMode;
      };
      setProfile(payload.profile);
      setWarnings(payload.warnings ?? []);
      setMode(payload.mode);
      setAnalysis(null);
      setMatch(null);
      setResume(null);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse that resume.");
    } finally {
      setBusy(null);
    }
  }

  async function parseFile(file: File) {
    setBusy("parse");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/parse", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as {
        profile: CareerProfile;
        warnings: string[];
        mode: GeneratorMode;
      };
      setProfile(payload.profile);
      setWarnings(payload.warnings ?? []);
      setMode(payload.mode);
      setSourceText("");
      setAnalysis(null);
      setMatch(null);
      setResume(null);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(null);
      if (resumeFile.current) resumeFile.current.value = "";
    }
  }

  async function analyze() {
    if (!profile) {
      setError("Add a profile before matching a job.");
      return;
    }
    setBusy("analyze");
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, text: jdText }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as {
        analysis: JdAnalysis;
        match: MatchResult;
        mode: GeneratorMode;
      };
      setAnalysis(payload.analysis);
      setMatch(payload.match);
      setMode(payload.mode);
      setResume(null);
      setStale(false);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze that job.");
    } finally {
      setBusy(null);
    }
  }

  async function analyzeFile(file: File) {
    if (!profile) {
      setError("Add a profile before uploading a job description.");
      return;
    }
    setBusy("analyze");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("profile", JSON.stringify(profile));
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as {
        analysis: JdAnalysis;
        match: MatchResult;
        mode: GeneratorMode;
      };
      setAnalysis(payload.analysis);
      setMatch(payload.match);
      setMode(payload.mode);
      setJdText("");
      setResume(null);
      setStale(false);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that job file.");
    } finally {
      setBusy(null);
      if (jobFile.current) jobFile.current.value = "";
    }
  }

  async function generate() {
    if (!profile || !analysis) {
      setError("Match a job before building the resume.");
      return;
    }
    setBusy("generate");
    setError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, analysis }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as {
        resume: ResumeDocument;
        match: MatchResult;
        mode: GeneratorMode;
      };
      setResume(payload.resume);
      setMatch(payload.match);
      setMode(payload.mode);
      setStale(false);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the resume.");
    } finally {
      setBusy(null);
    }
  }

  async function download(kind: "pdf" | "docx") {
    if (!resume) return;
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1];
      anchor.href = url;
      anchor.download = filename || (kind === "pdf" ? "resume.pdf" : "resume.docx");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  }

  const profileReady = Boolean(
    profile && (profile.name.trim() || profile.employment.length > 0 || profile.skills.length > 0),
  );

  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 items-center px-4 py-16">
        <p className="text-sm text-muted-foreground" role="status">
          Loading your draft…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Phase 1</p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">CustomResumeBuilder</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
            Turn a master resume and a job description into a two-page ATS resume. Accomplishments
            use Accomplished X as measured by Y by doing Z. Employers, skills, and metrics that are
            not in the profile are dropped.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={resetAll}>
          Start over
        </Button>
      </header>

      <ol className="mt-6 grid grid-cols-4 gap-2">
        {STEPS.map((item) => {
          const open =
            item.id === 0 ||
            (item.id === 1 && profileReady) ||
            (item.id === 2 && Boolean(match)) ||
            (item.id === 3 && Boolean(resume));
          const current = step === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!open}
                onClick={() => open && setStep(item.id)}
                className={`w-full rounded-xl border px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-3 ${
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                <span className="block text-[0.65rem] tracking-wide uppercase opacity-80">
                  0{item.id + 1}
                </span>
                <span className="mt-0.5 block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 hidden text-xs opacity-80 sm:block">{item.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {mode ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {mode === "openai"
            ? "OpenAI structured output is on for this step. Fact checks still run afterward."
            : "Running without an API key. Parsing, matching, and the draft use local heuristics."}
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No API key is required. Set OPENAI_API_KEY on the server if you want model parsing and
          rewriting. The heuristic path still exports a resume.
        </p>
      )}

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <CircleAlert />
          <AlertTitle>Something needs a fix</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stale && step > 0 ? (
        <Alert className="mt-4">
          <AlertTitle>Profile changed</AlertTitle>
          <AlertDescription>
            The last match used an older profile. Analyze the job again before you trust the gap
            list. Building the resume always rechecks the current profile.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6" aria-busy={busy !== null}>
        {step === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Career profile</CardTitle>
              <CardDescription>
                Upload a PDF or DOCX, paste text, or load the sample. Correct the structured
                profile before anything is written into a resume.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {!profile ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm font-medium">No profile yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    The builder keeps this draft in this browser only. Nothing is uploaded to an
                    account or database.
                  </p>
                </div>
              ) : null}

              <Textarea
                aria-label="Resume text"
                className="min-h-36"
                placeholder="Paste a resume here, then parse it."
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" onClick={useSampleProfile} data-testid="use-sample-profile">
                  Use sample profile
                </Button>
                {profileReady ? (
                  <Button type="button" onClick={() => setStep(1)} data-testid="continue-to-job">
                    Continue to job
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "parse" || sourceText.trim().length < 40}
                  onClick={() => parseText(sourceText)}
                  data-testid="parse-resume"
                >
                  {busy === "parse" ? <LoaderCircle className="animate-spin" /> : null}
                  Parse pasted text
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "parse"}
                  onClick={() => resumeFile.current?.click()}
                >
                  Upload PDF or DOCX
                </Button>
                <input
                  ref={resumeFile}
                  className="sr-only"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void parseFile(file);
                  }}
                />
              </div>
              {busy === "parse" ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Reading the resume and building an editable profile…
                </p>
              ) : null}
              {warnings.length > 0 ? (
                <Alert>
                  <AlertTitle>Check these fields</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              {profile ? <ProfileEditor profile={profile} onChange={updateProfile} /> : null}
              <div className="flex justify-end">
                <Button type="button" disabled={!profileReady} onClick={() => setStep(1)}>
                  Continue to job
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
              <CardDescription>
                Paste the posting or upload a PDF or DOCX. Required skills with no profile evidence
                stay in the gap list and are not written into the resume.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {!profileReady ? (
                <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  Add a career profile first.
                </div>
              ) : (
                <>
                  <Textarea
                    aria-label="Job description"
                    className="min-h-48"
                    placeholder="Paste a job description."
                    value={jdText}
                    onChange={(event) => {
                      setJdText(event.target.value);
                      setAnalysis(null);
                      setMatch(null);
                      setResume(null);
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button type="button" variant="outline" onClick={useSampleJob} data-testid="use-sample-jd">
                      Use sample job
                    </Button>
                    <Button
                      type="button"
                      disabled={busy === "analyze" || jdText.trim().length < 20}
                      onClick={() => void analyze()}
                      data-testid="analyze-job"
                    >
                      {busy === "analyze" ? <LoaderCircle className="animate-spin" /> : null}
                      Analyze job
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === "analyze"}
                      onClick={() => jobFile.current?.click()}
                    >
                      Upload PDF or DOCX
                    </Button>
                    <input
                      ref={jobFile}
                      className="sr-only"
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void analyzeFile(file);
                      }}
                    />
                  </div>
                  {busy === "analyze" ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      Reading the posting and scoring your evidence…
                    </p>
                  ) : null}
                </>
              )}
              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button type="button" disabled={!match} onClick={() => setStep(2)}>
                  Continue to match
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader>
              <CardTitle>Evidence match</CardTitle>
              <CardDescription>
                {analysis
                  ? `${analysis.title}${analysis.seniority ? ` · ${analysis.seniority}` : ""}${analysis.domain ? ` · ${analysis.domain}` : ""}`
                  : "Analyze a job to see what your profile can support."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {!match || !analysis ? (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                  <p className="text-sm font-medium">No match yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Go back to the job step and analyze a posting.
                  </p>
                  <Button type="button" className="mt-4" variant="outline" onClick={() => setStep(1)}>
                    Back to job
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4">
                    <div>
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">Match score</p>
                      <p className="font-serif text-5xl tracking-tight">{match.score}</p>
                      <ScoreExplanation match={match} />
                    </div>
                    {analysis.requiredSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {analysis.requiredSkills.map((skill) => (
                          <Badge
                            key={skill}
                            variant={match.gaps.some((gap) => gap.requirement === skill) ? "outline" : "secondary"}
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Separator />
                  <div className="grid gap-5 lg:grid-cols-2">
                    <section>
                      <h3 className="text-sm font-medium">Evidence that can be used</h3>
                      <ul className="mt-3 grid gap-3">
                        {matchedEvidence.length === 0 ? (
                          <li className="text-sm text-muted-foreground">
                            No overlapping evidence yet. The draft will stay limited to profile facts.
                          </li>
                        ) : (
                          matchedEvidence.map((item) => (
                            <li key={item.evidenceId} className="rounded-lg bg-muted/60 px-3 py-2">
                              <p className="text-xs text-muted-foreground">
                                {item.label} · {item.evidenceId}
                              </p>
                              <p className="mt-1 text-sm leading-5">{item.quote}</p>
                            </li>
                          ))
                        )}
                      </ul>
                    </section>
                    <section data-testid="gap-list">
                      <h3 className="text-sm font-medium">Left out of the resume</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        These requirements have no supporting evidence. They stay in this panel.
                      </p>
                      <ul className="mt-3 grid gap-2">
                        {match.gaps.length === 0 ? (
                          <li className="text-sm text-muted-foreground">No gaps detected.</li>
                        ) : (
                          match.gaps.map((gap) => (
                            <li
                              key={`${gap.kind}-${gap.requirement}`}
                              className="rounded-lg border border-dashed px-3 py-2 text-sm"
                            >
                              <span className="mr-2 text-xs tracking-wide text-muted-foreground uppercase">
                                {gap.kind}
                              </span>
                              {gap.requirement}
                            </li>
                          ))
                        )}
                      </ul>
                    </section>
                  </div>
                </>
              )}
              {busy === "generate" ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Selecting lines, checking facts, and fitting two pages…
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!match || busy === "generate"}
                  onClick={() => void generate()}
                  data-testid="build-resume"
                >
                  {busy === "generate" ? <LoaderCircle className="animate-spin" /> : null}
                  Build two-page resume
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-6">
            {!resume ? (
              <Card>
                <CardHeader>
                  <CardTitle>No resume yet</CardTitle>
                  <CardDescription>Build from the match step to preview and export.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back to match
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {resume.lineEstimate <= 40
                        ? "Preview is about one page. A fuller profile fills the second page."
                        : `Preview is about ${Math.max(2, Math.ceil(resume.lineEstimate / 40))} pages.`}
                      {resume.trimmedBullets > 0
                        ? ` ${resume.trimmedBullets} lower-scoring bullets were trimmed.`
                        : ""}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        disabled={busy === "pdf"}
                        onClick={() => void download("pdf")}
                        data-testid="download-pdf"
                      >
                        {busy === "pdf" ? <LoaderCircle className="animate-spin" /> : null}
                        Download PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy === "docx"}
                        onClick={() => void download("docx")}
                        data-testid="download-docx"
                      >
                        {busy === "docx" ? <LoaderCircle className="animate-spin" /> : null}
                        Download DOCX
                      </Button>
                    </div>
                  </div>
                  <ResumePreview resume={resume} />
                </div>
                <aside className="grid gap-4">
                  <Card size="sm" data-testid="ats-score">
                    <CardHeader>
                      <CardTitle>ATS score</CardTitle>
                      <CardDescription>
                        Scored from the resume text a scanner reads, the same way Jobscan and Teal
                        compare a file with the posting.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {resume.ats ? (
                        <>
                          <p className="font-serif text-5xl tracking-tight">{resume.ats.score}</p>
                          <ul className="grid gap-1 text-sm text-muted-foreground">
                            <li>
                              Hard skills {resume.ats.hardSkills.matched} of {resume.ats.hardSkills.total} in
                              the resume
                            </li>
                            {resume.ats.keywords.total > 0 ? (
                              <li>
                                Other tools {resume.ats.keywords.matched} of {resume.ats.keywords.total}
                              </li>
                            ) : null}
                            <li>{resume.ats.title.detail}</li>
                            <li>
                              Parse checks {resume.ats.parse.passed} of {resume.ats.parse.total}
                            </li>
                            <li>
                              Measurable bullets {resume.ats.measurable.withMetrics} of{" "}
                              {resume.ats.measurable.bullets}
                            </li>
                          </ul>
                          {resume.ats.hardSkills.hits.some((hit) => !hit.found) ? (
                            <div className="flex flex-wrap gap-2">
                              {resume.ats.hardSkills.hits
                                .filter((hit) => !hit.found)
                                .map((hit) => (
                                  <Badge key={`${hit.kind}-${hit.term}`} variant="outline">
                                    Missing {hit.term}
                                  </Badge>
                                ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Every required and preferred skill in the posting appears in the resume.
                            </p>
                          )}
                          <ul className="grid gap-1 text-sm">
                            {resume.ats.parse.checks
                              .filter((check) => !check.passed)
                              .map((check) => (
                                <li key={check.label} className="text-muted-foreground">
                                  {check.detail}
                                </li>
                              ))}
                          </ul>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Build the resume again to score the text an ATS would read.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Fact check</CardTitle>
                      <CardDescription>
                        {resume.validation.dropped.length === 0
                          ? "No invented metrics, skills, or employers were found."
                          : `${resume.validation.dropped.length} lines were dropped.`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {resume.validation.dropped.length > 0 ? (
                        <ul className="grid gap-2 text-sm">
                          {resume.validation.dropped.map((item) => (
                            <li key={item.reason + item.text}>
                              <p className="text-muted-foreground">{item.reason}</p>
                              <p className="mt-1">{item.text}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Every kept line cites profile evidence.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Citations</CardTitle>
                      <CardDescription>Each preview line maps to evidence ids.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="grid max-h-[28rem] gap-2 overflow-auto text-sm" data-testid="citation-list">
                        {citations.map((line) => (
                          <li key={`${line.section}-${line.text}`}>
                            <p className="text-xs text-muted-foreground">
                              {line.section} · {line.evidenceIds.join(", ")}
                            </p>
                            <p className="leading-5">{line.text}</p>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Still left out</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="grid gap-2 text-sm">
                        {resume.gaps.map((gap) => (
                          <li key={`${gap.kind}-${gap.requirement}`}>{gap.requirement}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </aside>
              </div>
            )}
            <div>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Back to match
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
