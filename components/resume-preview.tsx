"use client";

import type { ResumeDocument } from "@/lib/resume/types";

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="border-b border-stone-400 pb-0.5 text-[0.68rem] font-semibold tracking-[0.18em] text-stone-800 uppercase">
      {children}
    </h3>
  );
}

export function ResumePreview({ resume }: { resume: ResumeDocument }) {
  const skills = resume.skills.map((skill) => skill.text).join(" · ");
  return (
    <article
      data-testid="resume-preview"
      aria-label="Resume preview"
      className="mx-auto w-full max-w-[8.5in] bg-white text-stone-950 shadow-[0_18px_50px_-28px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/10 sm:min-h-[11in]"
    >
      <div className="px-6 py-8 font-serif text-[0.8rem] leading-5 sm:px-[0.7in] sm:py-[0.6in]">
        <header className="text-center">
          <h2 className="text-[1.55rem] leading-none font-semibold tracking-tight">{resume.name}</h2>
          {resume.headline ? (
            <p className="mt-1.5 text-[0.92rem] text-stone-700">{resume.headline}</p>
          ) : null}
          {resume.contactLine ? (
            <p className="mt-1 text-[0.72rem] leading-5 text-stone-600">{resume.contactLine}</p>
          ) : null}
        </header>

        {resume.summary.text ? (
          <section className="mt-4">
            <SectionTitle>Summary</SectionTitle>
            <p className="mt-1.5 text-justify">{resume.summary.text}</p>
          </section>
        ) : null}

        {skills ? (
          <section className="mt-3.5">
            <SectionTitle>Skills</SectionTitle>
            <p className="mt-1.5 text-justify">{skills}</p>
          </section>
        ) : null}

        {resume.experience.length > 0 ? (
          <section className="mt-3.5">
            <SectionTitle>Experience</SectionTitle>
            <div className="mt-1.5 grid gap-3">
              {resume.experience.map((role) => (
                <div key={`${role.evidenceIds.join("-")}-${role.employer}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-semibold">{role.title}</p>
                    {role.dates ? (
                      <p className="shrink-0 text-[0.75rem] text-stone-600 tabular-nums">{role.dates}</p>
                    ) : null}
                  </div>
                  <p className="text-[0.75rem] text-stone-700 italic">
                    {[role.employer, role.location].filter(Boolean).join(" · ")}
                  </p>
                  <ul className="mt-1 grid gap-1">
                    {role.bullets.map((bullet) => (
                      <li
                        key={bullet.evidenceIds.join("-") + bullet.text}
                        className="flex gap-2 text-justify"
                      >
                        <span className="text-stone-500" aria-hidden>
                          •
                        </span>
                        <span className="min-w-0 flex-1">{bullet.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.education.length > 0 ? (
          <section className="mt-3.5">
            <SectionTitle>Education</SectionTitle>
            <div className="mt-1.5 grid gap-2">
              {resume.education.map((item) => (
                <div key={item.evidenceIds.join("-")}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-semibold">{item.degree}</p>
                    {item.dates ? (
                      <p className="shrink-0 text-[0.75rem] text-stone-600 tabular-nums">{item.dates}</p>
                    ) : null}
                  </div>
                  {item.school ? <p className="text-[0.75rem] text-stone-700 italic">{item.school}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
