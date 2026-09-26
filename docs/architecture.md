# AI-Powered Custom Resume Builder

Source: [AI-Powered-Custom-Resume-Builder.pdf](./AI-Powered-Custom-Resume-Builder.pdf)

## 1. Objective

Build an AI-powered platform that automatically creates a job-specific, ATS-optimized resume by analyzing a candidate's verified career profile against a target Job Description (JD).

Core principle: AI can optimize wording and highlight relevant experience, but must not invent skills, technologies, employers, certifications, accomplishments, or metrics.

## 2. User Flow

```text
Master Resume / LinkedIn
        ↓
Candidate Career Profile
        ↓
Paste / Upload Job Description
        ↓
AI Job Analysis
        ↓
Candidate ↔ Job Matching
        ↓
Relevant Experience Retrieval
        ↓
Tailored Resume Generation
        ↓
Fact & Hallucination Validation
        ↓
ATS Optimization
        ↓
PDF / DOCX Resume
```

## 3. Proposed Architecture

```text
Web Application
React / Next.js
        │
        ▼
   API Gateway
        │
        ▼
Spring Boot Services
        │
   ┌────┼────────────┐
   ▼    ▼            ▼
Candidate API   Job API   Resume API
   │    │            │
   └────┼────────────┘
        ▼
  AI Orchestrator
    LangGraph
        │
   ┌────┼────────────┐
   ▼    ▼            ▼
  LLM  Embeddings  Reranker
   │    │            │
   │    ▼            │
   │  PostgreSQL/pgvector
   │    │
   └────┬────────────┘
        ▼
  Fact Validator
        │
        ▼
 Resume Generator
        │
        ▼
    S3 / PDF
```

## 4. AI Capabilities

### Job Description Intelligence

- Extract required/preferred skills
- Identify responsibilities
- Determine seniority and domain
- Extract important ATS keywords

### Candidate Intelligence

- Parse resume and LinkedIn profile
- Build structured career profile
- Extract skills, projects and accomplishments
- Maintain evidence/source for every candidate claim

### Job Matching

- Keyword matching
- Semantic matching using embeddings
- Experience/relevance matching
- Seniority and domain matching
- Overall Job Match Score

### Resume Generation

- Customized professional summary
- Relevant experience selection
- JD-aligned accomplishments
- Skills prioritization
- ATS keyword optimization

### Validation

- Verify every generated claim against candidate evidence
- Detect unsupported technologies and metrics
- Prevent fabricated experience
- Flag missing JD requirements rather than falsely adding them

## 5. Technology Stack

| Layer | Proposed Technology |
| --- | --- |
| Frontend | React / Next.js / TypeScript |
| Backend | Java 21 / Spring Boot |
| AI Service | Python / FastAPI |
| AI Orchestration | LangGraph |
| LLM | OpenAI / Claude / Gemini |
| Enterprise AI Gateway | AWS Bedrock |
| Embeddings | OpenAI / Gemini |
| Vector Database | PostgreSQL + pgvector |
| Database | Amazon Aurora PostgreSQL |
| Storage | Amazon S3 |
| Messaging | Amazon SQS |
| Workflow | AWS Step Functions |
| Authentication | Amazon Cognito |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions |
| Observability | CloudWatch / OpenTelemetry |

## 6. LinkedIn Integration

Use LinkedIn's OAuth/OpenID Connect capabilities for user authentication and permitted profile information.

```text
User
  ↓
LinkedIn Authorization
  ↓
User Consent
  ↓
LinkedIn Profile Data
  ↓
LinkedIn Adapter
  ↓
Candidate Career Profile
```

LinkedIn should be an optional profile enrichment source, not the application's only source of candidate information. Job descriptions can be supplied through paste, upload, or supported job integrations.

## 7. Key Data Model

```text
Candidate
├── Employment
│   ├── Projects
│   ├── Achievements
│   └── Technologies
├── Skills
├── Certifications
├── Education
├── Resume Versions
└── Job Applications
    ├── Job Description
    ├── JD Requirements
    ├── Match Score
    └── Generated Resume
```

Each experience/achievement should maintain source, verification status and confidence to support evidence-based generation.

## 8. MVP Scope

### Phase 1

- Resume upload and parsing
- Candidate career profile
- JD upload/paste
- AI JD analysis
- Candidate-JD matching
- RAG-based experience retrieval
- Customized resume generation
- Fact validation
- ATS optimization
- PDF/DOCX export

### Phase 2

- LinkedIn integration
- Multiple resume templates
- Cover letter generation
- Resume version management
- Application tracking
- Job recommendations
- Interview preparation

## 9. Key Differentiator

Evidence-backed resume generation.

Every generated resume statement should be traceable to a verified candidate experience.

```text
Job Requirement
      ↓
Relevant Candidate Evidence
      ↓
AI Rewrite
      ↓
Fact Validation
      ↓
ATS-Optimized Resume
```

This creates a trusted AI career platform, rather than simply a resume-generation tool.
