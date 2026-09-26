import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const pdfState: { text: string | string[] } = { text: "Hello from the PDF." };
const docxState: { value: string; useDefault: boolean } = {
  value: "Hello from the DOCX.",
  useDefault: false,
};

mock.module("unpdf", {
  namedExports: {
    getDocumentProxy: async () => ({ kind: "pdf" }),
    extractText: async () => ({ text: pdfState.text }),
  },
});

mock.module("mammoth", {
  namedExports: {
    extractRawText: async () => {
      if (docxState.useDefault) {
        throw new Error("named export should not be used");
      }
      return { value: docxState.value };
    },
    default: {
      extractRawText: async () => ({ value: docxState.value }),
    },
  },
});

describe("upload text extraction", async () => {
  const { extractUploadText } = await import("./extract");

  function file(contents: string | Uint8Array, name: string, type = ""): File {
    const body = typeof contents === "string" ? [contents] : [contents];
    return new File(body, name, { type });
  }

  it("rejects empty, oversized, and unsupported files", async () => {
    await assert.rejects(extractUploadText(file("", "empty.txt")), /empty/);
    await assert.rejects(
      extractUploadText(file(new Uint8Array(8 * 1024 * 1024 + 1), "big.txt")),
      /8 MB/,
    );
    await assert.rejects(
      extractUploadText(file("pixels", "photo.png", "image/png")),
      /PDF or DOCX/,
    );
  });

  it("reads text and markdown uploads", async () => {
    assert.equal(
      await extractUploadText(file("  hello resume  ", "notes.txt")),
      "hello resume",
    );
    assert.equal(
      await extractUploadText(file("# Title", "notes.md")),
      "# Title",
    );
    assert.equal(
      await extractUploadText(file("plain", "notes.bin", "text/plain")),
      "plain",
    );
    await assert.rejects(
      extractUploadText(file("   ", "blank.txt")),
      /text file is empty/,
    );
  });

  it("reads PDF text from a string or a page list", async () => {
    pdfState.text = "Page one";
    assert.equal(
      await extractUploadText(file(new Uint8Array([1]), "resume.pdf")),
      "Page one",
    );
    pdfState.text = ["Page one", "Page two"];
    assert.equal(
      await extractUploadText(
        file(new Uint8Array([1]), "resume.bin", "application/pdf"),
      ),
      "Page one\nPage two",
    );
    pdfState.text = "   ";
    await assert.rejects(
      extractUploadText(file(new Uint8Array([1]), "resume.pdf")),
      /No selectable text/,
    );
  });

  it("reads DOCX text and reports an empty document", async () => {
    docxState.value = "Experience at Acme";
    docxState.useDefault = false;
    assert.equal(
      await extractUploadText(file(new Uint8Array([1]), "resume.docx")),
      "Experience at Acme",
    );
    assert.equal(
      await extractUploadText(
        file(
          new Uint8Array([1]),
          "resume.bin",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ),
      "Experience at Acme",
    );
    docxState.value = "   ";
    await assert.rejects(
      extractUploadText(file(new Uint8Array([1]), "resume.docx")),
      /No text found/,
    );
  });
});
