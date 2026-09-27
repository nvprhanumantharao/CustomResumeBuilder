# CustomResumeBuilder

A two-page resume builder. Upload or paste a master resume and a job description, edit the parsed career profile, then export an ATS-style PDF or DOCX. Accomplishments are rewritten as “Accomplished X as measured by Y by doing Z” using only facts already in the profile. Generation can select and reword. It does not invent employers, skills, technologies, certifications, accomplishments, or metrics.

This slice keeps everything in the browser (`localStorage`). There is no account and no database.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:3847](http://127.0.0.1:3847).

```bash
npm test
```

## Optional OpenAI key

The app works with no key. Parsing, job analysis, keyword matching, and the two-page draft then use local heuristics. Achievement lines are still rewritten into the XYZ form from the profile text.

To use structured model output for parsing, job analysis, and rewriting, set:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_MODEL` defaults to `gpt-4o-mini`. Fact validation still runs after a model rewrite and drops lines that cite a missing id, introduce a metric that is not in the cited quotes, name a skill that is not in those quotes or the profile skill list, or name an employer or school that is not in the profile. Job requirements with no supporting evidence stay in the match panel and are not written into the resume.

If the key is missing or a model call fails, the same flow continues on the heuristic path.

## Technologies

| Area | Technology |
| --- | --- |
| App | Next.js 16, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Model | OpenAI through the Vercel AI SDK (`gpt-4o-mini` by default) |
| Structured output | Zod |
| Resume import | unpdf for PDF, mammoth for DOCX |
| Export | `@react-pdf/renderer` for PDF, `docx` for DOCX |
| Draft storage | Browser `localStorage` |
| Tests | Node.js test runner via `tsx` |

## AI Technologies/Concepts

CustomResumeBuilder uses a chat model and an embedding model through the Vercel AI SDK. By default those are OpenAI `gpt-4o-mini` and `text-embedding-3-small`, with Anthropic or Google available for reranking and semantic checks. The model returns structured JSON to parse a resume, read a job description, and rewrite lines. Retrieval splits the profile into evidence chunks, embeds them, caches the vectors locally, and ranks them with cosine similarity plus keyword overlap before an LLM reranker keeps the top matches. Rewrites must cite that evidence and use the XYZ accomplishment form. A rules-based checker then drops invented metrics, skills, and employers, and a second model pass can reject unsupported lines and request up to two new drafts. If no API key is set, the same flow continues with local heuristics. The match score, qualification bars, and ATS score are computed in code and do not call a model.

## Architecture

The product architecture is in [docs/architecture.md](docs/architecture.md). The original one-page design is [docs/AI-Powered-Custom-Resume-Builder.pdf](docs/AI-Powered-Custom-Resume-Builder.pdf).

## Flow

1. **Profile.** PDF, DOCX, pasted text, or the built-in sample. Correct the profile before generating.
2. **Job.** Paste or upload the posting, or use the sample job.
3. **Match.** Score, the evidence that can be used, and the gaps that will be left out.
4. **Resume.** Two-page preview, validation notes, PDF and DOCX download.
