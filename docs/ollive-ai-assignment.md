# Ollive AI Assignment Plan

## Goal

Build a production-shaped LLM chatbot and observability system that matches Ollive's assignment brief: a multi‑turn chatbot UI, a lightweight inference logging SDK/wrapper, an ingestion API, database persistence, and clear architecture notes. The project should be small enough to finish quickly but structured like a real product that could grow into a full platform. It should also be designed so that a long‑term memory layer (such as Mem0 or a similar service) could be plugged in later without major changes.

## Scope

### Must‑have features

- Multi‑turn chatbot UI.
- Short conversational context management.
- One foundation model provider to start.
- A lightweight SDK or wrapper around LLM calls.
- Real‑time‑ish logging from the SDK to the ingestion API.
- Backend ingestion service that validates and stores logs.
- Database storage for chat messages, inference logs, and extracted metadata.
- Conversation list view.
- Conversation detail view.
- Ability to resume a conversation.
- Ability to cancel a conversation.
- README with setup, architecture, schema decisions, and tradeoffs.
- Architecture notes with ingestion flow, logging strategy, scaling, and failure handling.
- Demo video or hosted demo.

### Strong bonus features

- Streaming responses.
- Multi‑provider support.
- PII redaction before persistence and/or display.
- Latency, throughput, and error dashboards.
- Docker Compose one‑command setup.
- Event‑based architecture for ingestion and processing.


## Product direction

The product should feel like a lightweight LLM ops platform rather than a toy chatbot. The chatbot is only the visible surface; the real value is the logging, ingestion, storage, and observability pipeline behind it. The system should show practical judgment around reliability, schema design, and developer experience.

Separately, the design should make it obvious how a long‑term memory layer could be integrated later (for example, to provide durable user or conversation‑level context), without actually needing to implement a Mem0 integration for this assignment.

## Architecture summary

Use a simple frontend, a backend API, an SDK‑like wrapper, and a relational database.

- The frontend talks to the backend for chat actions, conversation management, and dashboards.
- The backend calls the model provider, coordinates context, and orchestrates logging.
- A lightweight SDK/wrapper is responsible for:
  - wrapping model calls,
  - capturing inference metadata, and
  - emitting log events to the ingestion API.
- The ingestion service validates payloads, enriches them, and writes structured records to the database.

Optionally, define a `MemoryAdapter` interface in the backend that:

- can read “memories” for a given user or conversation, and
- can write new memories based on conversations or logs.


## Functional behavior

### Chatbot

- User can start a new conversation.
- User can send multiple messages in the same conversation.
- The app keeps only short context in the prompt (recent messages and, optionally, a small summary).
- The UI shows the assistant response clearly.
- The conversation can be resumed later.
- The conversation can be cancelled.

### Logging layer

- Every model request creates a log event.
- Each log event includes:
  - provider
  - model
  - timestamps
  - latency
  - token usage (if available)
  - request status
  - error information (if any)
  - conversation/session ID
  - redacted input/output previews
- Log events are sent to the ingestion API with minimal delay.
- Failures in logging should not break chat delivery.

### Ingestion service

- Accepts structured log payloads over an HTTP API.
- Validates required fields and rejects malformed payloads gracefully.
- May store raw payloads and processed records separately.
- Extracts useful metadata for querying and dashboards (e.g., per‑provider metrics, error types).

### Storage

- Store conversations.
- Store messages.
- Store inference logs.
- Store extracted metadata for querying.
- Make the schema easy to reason about and extend.

Optionally, store a simple “memory” table for future use:

- durable facts derived from conversations,
- key preferences, or
- high‑level summaries that could be reused across sessions.

### Observability

- Show basic usage metrics.
- Show latency.
- Show error counts.
- Show request volume.
- Optionally show per‑provider breakdowns.
- Keep dashboards simple but grounded on real stored data.

## Recommended stack

Use the stack you can ship fastest with.

- Frontend: Next.js or similar React framework.
- Backend API: Node.js or Python, with a lightweight web framework.
- Database: PostgreSQL.
- Optional cache/queue: Redis if needed for buffering or fan‑out.
- Deployment: Docker Compose locally, with clear `.env` configuration.
- Model provider: one of OpenAI, Anthropic, Gemini, or another equivalent.
- Charts: simple built‑in dashboard views or lightweight charting.

## Repo structure

Use a monorepo so the project is easy to navigate.

```text
ollive-ai-assignment/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── llm-sdk/
│   ├── shared/
│   └── database/
├── docs/
│   ├── architecture.md
│   ├── schema.md
│   └── tradeoffs.md
├── docker/
├── scripts/
├── .env.example
├── docker-compose.yml
└── README.md
```

### Folder responsibilities

- `apps/web`: Chat UI, conversation list, resume/cancel actions, and dashboards.
- `apps/api`: Chat endpoints, ingestion endpoints, storage logic, and optional memory adapter interface.
- `packages/llm-sdk`: Lightweight wrapper around model calls and logging emission.
- `packages/shared`: Shared types, validation, constants, and helpers.
- `packages/database`: Schema, migrations, DB client, and data access helpers.
- `docs`: Written architecture and design decisions.
- `docker`: Any container‑specific configuration.
- `scripts`: Seed scripts, local dev helpers, and demo utilities.

## Database model

Design for clarity and easy querying.

Core entities:

- `users` or anonymous actors if needed.
- `conversations`.
- `messages`.
- `inference_logs`.
- `metadata` or `extracted_fields`.


Include fields for:

- ids.
- timestamps.
- conversation/session linkage.
- provider/model.
- latency.
- token counts (if available).
- status and error info.
- input and output previews (with redaction).
- redaction flags if used.

## API surface

Keep the API small and explicit.

- Start conversation.
- Send message.
- Resume conversation.
- Cancel conversation.
- Fetch conversation list.
- Fetch conversation detail.
- Ingest inference log.
- Fetch metrics for dashboard.

Optionally define internal endpoints/hooks for:

- reading memories for a conversation or user,
- writing memories after a message or log is processed.

## Acceptance criteria

The project is done when:

- The chat UI works end to end.
- The SDK wrapper captures inference metadata.
- Logs reach the ingestion service reliably.
- Data is persisted in the database.
- Conversation list and detail views work.
- Cancellation and resumption work.
- README and architecture docs are clear.
- Demo can be run locally with minimal setup.
- The design clearly indicates where a memory service (such as Mem0) could be integrated.

## Quality bar

- Keep the implementation clean and simple.
- Prefer readability over cleverness.
- Avoid unnecessary abstractions.
- Add only the bonus features that strengthen the story.
- Make the system easy for reviewers to understand in under 10 minutes.
- Make the Mem0‑style memory integration points easy to see but optional.

## Deliverables

- Complete source code in GitHub.
- README.
- Architecture notes.
- Schema notes.
- Demo link or video.
- Optional screenshots.