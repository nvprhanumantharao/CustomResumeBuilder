export async function extractUploadText(file: File): Promise<string> {
  if (file.size === 0) throw new Error("That file is empty.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Upload a file smaller than 8 MB.");
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(data);
    const result = await extractText(pdf, { mergePages: true });
    const raw = result.text as string | string[];
    const text = (typeof raw === "string" ? raw : raw.join("\n")).trim();
    if (!text) throw new Error("No selectable text found in that PDF.");
    return text;
  }

  if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
    const mod = (await import("mammoth")) as typeof import("mammoth") & {
      default?: typeof import("mammoth");
    };
    const mammoth = typeof mod.extractRawText === "function" ? mod : mod.default;
    if (!mammoth) throw new Error("Could not read that DOCX.");
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    const text = result.value.trim();
    if (!text) throw new Error("No text found in that DOCX.");
    return text;
  }

  if (name.endsWith(".txt") || name.endsWith(".md") || type.startsWith("text/")) {
    const text = (await file.text()).trim();
    if (!text) throw new Error("That text file is empty.");
    return text;
  }

  throw new Error("Upload a PDF or DOCX, or paste the text instead.");
}
