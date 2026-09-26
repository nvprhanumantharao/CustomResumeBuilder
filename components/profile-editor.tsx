"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createId } from "@/lib/profile/ids";
import type { CareerProfile, Employment } from "@/lib/profile/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ProfileEditor({
  profile,
  onChange,
}: {
  profile: CareerProfile;
  onChange: (profile: CareerProfile) => void;
}) {
  const patch = (partial: Partial<CareerProfile>) => onChange({ ...profile, ...partial });

  const updateJob = (id: string, partial: Partial<Employment>) => {
    patch({
      employment: profile.employment.map((job) => (job.id === id ? { ...job, ...partial } : job)),
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={profile.name} onChange={(event) => patch({ name: event.target.value })} />
        </Field>
        <Field label="Headline">
          <Input
            value={profile.headline}
            onChange={(event) => patch({ headline: event.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={profile.email}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input value={profile.phone} onChange={(event) => patch({ phone: event.target.value })} />
        </Field>
        <Field label="Location">
          <Input
            value={profile.location}
            onChange={(event) => patch({ location: event.target.value })}
          />
        </Field>
        <Field label="Links">
          <Input
            value={profile.links.join(", ")}
            placeholder="https://github.com/you"
            onChange={(event) =>
              patch({
                links: event.target.value.split(",").map((link) => link.trim()),
              })
            }
          />
        </Field>
      </div>

      <Field label="Summary">
        <Textarea
          className="min-h-28"
          value={profile.summary}
          onChange={(event) => patch({ summary: event.target.value })}
        />
      </Field>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Skills</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({ skills: [...profile.skills, { id: createId("skill"), name: "" }] })
            }
          >
            Add skill
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {profile.skills.map((skill) => (
            <div key={skill.id} className="flex gap-2">
              <Input
                aria-label="Skill"
                value={skill.name}
                onChange={(event) =>
                  patch({
                    skills: profile.skills.map((item) =>
                      item.id === skill.id ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch({ skills: profile.skills.filter((item) => item.id !== skill.id) })
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Experience</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                employment: [
                  ...profile.employment,
                  {
                    id: createId("emp"),
                    employer: "",
                    title: "",
                    location: "",
                    start: "",
                    end: "",
                    achievements: [{ id: createId("ach"), text: "" }],
                  },
                ],
              })
            }
          >
            Add employer
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Each bullet is evidence. The draft can select and reorder these lines. It cannot add a
          metric, employer, or tool that is not written here.
        </p>
        {profile.employment.map((job) => (
          <div key={job.id} className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <Input
                  value={job.title}
                  onChange={(event) => updateJob(job.id, { title: event.target.value })}
                />
              </Field>
              <Field label="Employer">
                <Input
                  value={job.employer}
                  onChange={(event) => updateJob(job.id, { employer: event.target.value })}
                />
              </Field>
              <Field label="Location">
                <Input
                  value={job.location}
                  onChange={(event) => updateJob(job.id, { location: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start">
                  <Input
                    value={job.start}
                    onChange={(event) => updateJob(job.id, { start: event.target.value })}
                  />
                </Field>
                <Field label="End">
                  <Input
                    value={job.end}
                    onChange={(event) => updateJob(job.id, { end: event.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="grid gap-2">
              {job.achievements.map((achievement) => (
                <div key={achievement.id} className="flex gap-2">
                  <Textarea
                    aria-label="Achievement evidence"
                    className="min-h-16"
                    value={achievement.text}
                    onChange={(event) =>
                      updateJob(job.id, {
                        achievements: job.achievements.map((item) =>
                          item.id === achievement.id ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateJob(job.id, {
                        achievements: job.achievements.filter((item) => item.id !== achievement.id),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateJob(job.id, {
                      achievements: [...job.achievements, { id: createId("ach"), text: "" }],
                    })
                  }
                >
                  Add bullet
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({ employment: profile.employment.filter((item) => item.id !== job.id) })
                  }
                >
                  Remove employer
                </Button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Education</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                education: [
                  ...profile.education,
                  {
                    id: createId("edu"),
                    school: "",
                    degree: "",
                    location: "",
                    start: "",
                    end: "",
                    details: "",
                  },
                ],
              })
            }
          >
            Add school
          </Button>
        </div>
        {profile.education.map((item) => (
          <div key={item.id} className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2">
            <Field label="Degree">
              <Input
                value={item.degree}
                onChange={(event) =>
                  patch({
                    education: profile.education.map((edu) =>
                      edu.id === item.id ? { ...edu, degree: event.target.value } : edu,
                    ),
                  })
                }
              />
            </Field>
            <Field label="School">
              <Input
                value={item.school}
                onChange={(event) =>
                  patch({
                    education: profile.education.map((edu) =>
                      edu.id === item.id ? { ...edu, school: event.target.value } : edu,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Start">
              <Input
                value={item.start}
                onChange={(event) =>
                  patch({
                    education: profile.education.map((edu) =>
                      edu.id === item.id ? { ...edu, start: event.target.value } : edu,
                    ),
                  })
                }
              />
            </Field>
            <Field label="End">
              <Input
                value={item.end}
                onChange={(event) =>
                  patch({
                    education: profile.education.map((edu) =>
                      edu.id === item.id ? { ...edu, end: event.target.value } : edu,
                    ),
                  })
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch({ education: profile.education.filter((edu) => edu.id !== item.id) })
                }
              >
                Remove school
              </Button>
            </div>
          </div>
        ))}
      </section>

      <details className="rounded-xl bg-card p-4 ring-1 ring-foreground/10" open={profile.certifications.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">Certifications and projects</summary>
        <div className="mt-4 grid gap-4">
          {profile.certifications.map((cert) => (
            <div key={cert.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
              <Input
                aria-label="Certification"
                value={cert.name}
                onChange={(event) =>
                  patch({
                    certifications: profile.certifications.map((item) =>
                      item.id === cert.id ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
              />
              <Input
                aria-label="Issuer"
                value={cert.issuer}
                onChange={(event) =>
                  patch({
                    certifications: profile.certifications.map((item) =>
                      item.id === cert.id ? { ...item, issuer: event.target.value } : item,
                    ),
                  })
                }
              />
              <Input
                aria-label="Year"
                value={cert.year}
                onChange={(event) =>
                  patch({
                    certifications: profile.certifications.map((item) =>
                      item.id === cert.id ? { ...item, year: event.target.value } : item,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch({
                    certifications: profile.certifications.filter((item) => item.id !== cert.id),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              patch({
                certifications: [
                  ...profile.certifications,
                  { id: createId("cert"), name: "", issuer: "", year: "" },
                ],
              })
            }
          >
            Add certification
          </Button>
          {profile.projects.map((project) => (
            <div key={project.id} className="grid gap-2">
              <Input
                aria-label="Project name"
                value={project.name}
                onChange={(event) =>
                  patch({
                    projects: profile.projects.map((item) =>
                      item.id === project.id ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
              />
              <Textarea
                aria-label="Project description"
                value={project.description}
                onChange={(event) =>
                  patch({
                    projects: profile.projects.map((item) =>
                      item.id === project.id ? { ...item, description: event.target.value } : item,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
