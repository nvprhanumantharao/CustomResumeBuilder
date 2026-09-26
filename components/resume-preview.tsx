"use client";

import type { ResumeDocument } from "@/lib/resume/types";

export function ResumePreview({ resume }: { resume: ResumeDocument }) {
  return (
    <article
      data-testid="resume-preview"
      aria-label="Resume preview"
      className="mx-auto w-full max-w-[8.5in] bg-white text-stone-950 shadow-[0_18px_50px_-28px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/10 sm:min-h-[11in]"
    >
      <div className="px-6 py-8 font-serif sm:px-[0.75in] sm:py-[0.7in]">
        <header className="border-b border-stone-300 pb-3 text-center">
          <h2 className="text-[1.45rem] leading-tight tracking-tight">{resume.name}</h2>
          {resume.headline ? (
            <p className="mt-1 text-[0.95rem] text-stone-700">{resume.headline}</p>
          ) : null}
          {resume.contactLine ? (
            <p className="mt-1 text-[0.72rem] leading-5 text-stone-600">{resume.contactLine}</p>
          ) : null}
        </header>

        {resume.summary.text ? (
          <section className="mt-4">
            <h3 className="border-b border-stone-300 pb-0.5 text-[0.68rem] tracking-[0.16em] uppercase">
              Summary
            </h3>
            <p className="mt-2 text-[0.78rem] leading-5">{resume.summary.text}</p>
          </section>
        ) : null}

        {resume.skills.length > 0 ? (
          <section className="mt-4">
            <h3 className="border-b border-stone-300 pb-0.5 text-[0.68rem] tracking-[0.16em] uppercase">
              Skills
            </h3>
            <p className="mt-2 text-[0.78rem] leading-5">
              {resume.skills.map((skill) => skill.text).join(", ")}
            </p>
          </section>
        ) : null}

        {resume.experience.length > 0 ? (
          <section className="mt-4">
            <h3 className="border-b border-stone-300 pb-0.5 text-[0.68rem] tracking-[0.16em] uppercase">
              Experience
            </h3>
            <div className="mt-2 grid gap-3">
              {resume.experience.map((role) => (
                <div key={`${role.evidenceIds.join("-")}-${role.employer}`}>
                  <p className="text-[0.84rem] font-semibold">{role.title}</p>
                  <p className="text-[0.75rem] text-stone-700">
                    {[role.employer, role.location, role.dates].filter(Boolean).join(" · ")}
                  </p>
                  <ul className="mt-1 grid gap-1">
                    {role.bullets.map((bullet) => (
                      <li key={bullet.evidenceIds.join("-") + bullet.text} className="text-[0.78rem] leading-5">
                        <span className="mr-1.5 text-stone-500">•</span>
                        {bullet.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.education.length > 0 ? (
          <section className="mt-4">
            <h3 className="border-b border-stone-300 pb-0.5 text-[0.68rem] tracking-[0.16em] uppercase">
              Education
            </h3>
            <div className="mt-2 grid gap-1">
              {resume.education.map((item) => (
                <p key={item.evidenceIds.join("-")} className="text-[0.78rem] leading-5">
                  {item.text}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
