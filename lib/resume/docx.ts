import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { ResumeDocument } from "./types";

const font = "Times New Roman";
const contentWidth = 12240 - 864 - 864;

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 60 },
    border: {
      bottom: { color: "78716C", space: 1, style: "single", size: 8 },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font,
        size: 20,
        characterSpacing: 120,
      }),
    ],
  });
}

function prose(text: string, after = 60): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after },
    children: [new TextRun({ text, font, size: 21 })],
  });
}

function splitLine(left: string, right: string, options?: { bold?: boolean; italic?: boolean; after?: number }): Paragraph {
  const children = [
    new TextRun({
      text: left,
      bold: options?.bold,
      italics: options?.italic,
      font,
      size: options?.bold ? 22 : 21,
    }),
  ];
  if (right) {
    children.push(new TextRun({ text: `\t${right}`, font, size: 21 }));
  }
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
    spacing: { before: options?.bold ? 120 : 0, after: options?.after ?? 0 },
    children,
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 280, hanging: 180 },
    spacing: { after: 40 },
    children: [new TextRun({ text: `•  ${text}`, font, size: 21 })],
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

  if (resume.headline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: resume.headline, font, size: 22 })],
      }),
    );
  }
  if (resume.contactLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: resume.contactLine, font, size: 18, color: "57534E" })],
      }),
    );
  }
  if (resume.summary.text) {
    children.push(sectionTitle("Summary"));
    children.push(prose(resume.summary.text));
  }
  if (resume.skills.length > 0) {
    children.push(sectionTitle("Skills"));
    children.push(prose(resume.skills.map((skill) => skill.text).join(" · ")));
  }
  if (resume.experience.length > 0) {
    children.push(sectionTitle("Experience"));
    for (const role of resume.experience) {
      children.push(splitLine(role.title, role.dates, { bold: true }));
      const meta = [role.employer, role.location].filter(Boolean).join(" · ");
      if (meta) children.push(splitLine(meta, "", { italic: true, after: 40 }));
      for (const item of role.bullets) children.push(bullet(item.text));
    }
  }
  if (resume.education.length > 0) {
    children.push(sectionTitle("Education"));
    for (const item of resume.education) {
      children.push(splitLine(item.degree, item.dates, { bold: true }));
      if (item.school) children.push(splitLine(item.school, "", { italic: true, after: 40 }));
    }
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
