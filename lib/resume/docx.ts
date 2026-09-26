import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ResumeDocument } from "./types";

const font = "Times New Roman";

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    border: {
      bottom: { color: "A8A29E", space: 1, style: "single", size: 6 },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font,
        size: 20,
        characterSpacing: 80,
      }),
    ],
  });
}

function body(text: string, options?: { bold?: boolean; after?: number; center?: boolean }): Paragraph {
  return new Paragraph({
    alignment: options?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: options?.after ?? 40 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        font,
        size: options?.bold ? 22 : 21,
      }),
    ],
  });
}

export async function renderResumeDocx(resume: ResumeDocument): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: resume.name || "Resume", bold: true, font, size: 36 })],
    }),
  ];

  if (resume.headline) children.push(body(resume.headline, { center: true, after: 20 }));
  if (resume.contactLine) children.push(body(resume.contactLine, { center: true, after: 80 }));
  if (resume.summary.text) {
    children.push(sectionTitle("Summary"));
    children.push(body(resume.summary.text, { after: 60 }));
  }
  if (resume.skills.length > 0) {
    children.push(sectionTitle("Skills"));
    children.push(body(resume.skills.map((skill) => skill.text).join(", "), { after: 60 }));
  }
  if (resume.experience.length > 0) {
    children.push(sectionTitle("Experience"));
    for (const role of resume.experience) {
      children.push(body(role.title, { bold: true, after: 0 }));
      children.push(
        body([role.employer, role.location, role.dates].filter(Boolean).join(" · "), { after: 40 }),
      );
      for (const bullet of role.bullets) {
        children.push(body(`• ${bullet.text}`, { after: 40 }));
      }
    }
  }
  if (resume.education.length > 0) {
    children.push(sectionTitle("Education"));
    for (const item of resume.education) children.push(body(item.text));
  }

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 864, bottom: 720, left: 864 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
