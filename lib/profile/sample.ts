import type { CareerProfile } from "./types";

export const sampleProfile: CareerProfile = {
  name: "Maya Chen",
  email: "maya.chen@example.com",
  phone: "(206) 555-0148",
  location: "Seattle, WA",
  links: ["https://github.com/mayachen"],
  headline: "Senior Software Engineer",
  summary:
    "Senior software engineer who builds TypeScript services and React products. Recent work at Northwind Labs focused on Node.js APIs and PostgreSQL performance.",
  employment: [
    {
      id: "emp-northwind",
      employer: "Northwind Labs",
      title: "Senior Software Engineer",
      location: "Seattle, WA",
      start: "2021",
      end: "Present",
      achievements: [
        {
          id: "ach-nw-latency",
          text: "Cut API p95 latency from 480ms to 190ms by rewriting the Node.js request pipeline and adding PostgreSQL indexes.",
        },
        {
          id: "ach-nw-design",
          text: "Shipped a React and TypeScript design system used by 4 product squads.",
        },
        {
          id: "ach-nw-billing",
          text: "Led a billing migration into 6 services that process $12M in annual invoices.",
        },
      ],
    },
    {
      id: "emp-harbor",
      employer: "Harbor & Co",
      title: "Software Engineer",
      location: "Seattle, WA",
      start: "2018",
      end: "2021",
      achievements: [
        {
          id: "ach-hb-quality",
          text: "Built a Python data quality checker that flagged 1,200 bad records a week before they reached finance.",
        },
        {
          id: "ach-hb-tests",
          text: "Introduced integration tests that covered the release path for a 14-person engineering group.",
        },
      ],
    },
  ],
  education: [
    {
      id: "edu-uw",
      school: "University of Washington",
      degree: "B.S. Computer Science",
      location: "Seattle, WA",
      start: "2014",
      end: "2018",
      details: "",
    },
  ],
  skills: [
    { id: "skill-ts", name: "TypeScript" },
    { id: "skill-react", name: "React" },
    { id: "skill-node", name: "Node.js" },
    { id: "skill-pg", name: "PostgreSQL" },
    { id: "skill-py", name: "Python" },
    { id: "skill-rest", name: "REST APIs" },
  ],
  certifications: [
    {
      id: "cert-aws",
      name: "AWS Certified Cloud Practitioner",
      issuer: "Amazon Web Services",
      year: "2022",
    },
  ],
  projects: [
    {
      id: "proj-ledger",
      name: "ledger-lint",
      description: "Open-source CLI that checks invoice CSV files before import.",
      achievements: [
        {
          id: "ach-ledger-1",
          text: "Rejected malformed invoice rows in local dry runs before finance import.",
        },
      ],
    },
  ],
};

export const sampleResumeText = `Maya Chen
Senior Software Engineer
Seattle, WA
maya.chen@example.com
(206) 555-0148
https://github.com/mayachen

SUMMARY
Senior software engineer who builds TypeScript services and React products. Recent work at Northwind Labs focused on Node.js APIs and PostgreSQL performance.

SKILLS
TypeScript, React, Node.js, PostgreSQL, Python, REST APIs

EXPERIENCE
Senior Software Engineer | Northwind Labs | Seattle, WA | 2021 – Present
- Cut API p95 latency from 480ms to 190ms by rewriting the Node.js request pipeline and adding PostgreSQL indexes.
- Shipped a React and TypeScript design system used by 4 product squads.
- Led a billing migration into 6 services that process $12M in annual invoices.

Software Engineer | Harbor & Co | Seattle, WA | 2018 – 2021
- Built a Python data quality checker that flagged 1,200 bad records a week before they reached finance.
- Introduced integration tests that covered the release path for a 14-person engineering group.

EDUCATION
B.S. Computer Science | University of Washington | Seattle, WA | 2014 – 2018

CERTIFICATIONS
AWS Certified Cloud Practitioner | Amazon Web Services | 2022

PROJECTS
ledger-lint | Open-source CLI that checks invoice CSV files before import.
- Rejected malformed invoice rows in local dry runs before finance import.
`;

export function blankProfile(): CareerProfile {
  return {
    name: "",
    email: "",
    phone: "",
    location: "",
    links: [],
    headline: "",
    summary: "",
    employment: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
  };
}
