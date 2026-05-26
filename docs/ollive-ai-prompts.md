# Ollive AI Build Prompts

Use this file together with `ollive-ai-assignment.md`.  
The idea is to work in small, intentional vibe‑coding steps so the repo stays coherent, and to keep AI‑tool sessions clean enough that they can later be reused as proof of your workflow (e.g., for Mem0).

## Prompt 0: Understand the assignment

Read the assignment document fully, then restate in your own words:

- goal
- required features
- bonus features
- repo structure
- data model
- API surface
- acceptance criteria
- where a memory layer (e.g., Mem0‑style) could plug in later

Do not write code yet. Identify the minimum shippable scope and the best bonus features to include.

## Prompt 1: Scaffold the monorepo

Create the repo structure exactly as described in the assignment document.  
Set up the apps, packages, docs, scripts, and docker folders.  
Add placeholder files for README, architecture notes, schema notes, and tradeoffs.  
Create a clean local development experience.

Expected output:

- folder scaffold
- package/workspace setup
- environment example file
- basic scripts for dev and build
- lint/test placeholders if useful

## Prompt 2: Design the schema

Create the database schema for conversations, messages, inference logs, and extracted metadata.  
Optionally define a simple `memories` table to illustrate how durable facts or preferences could be stored in the future.

Think through:

- indexing
- timestamps
- conversation linkage
- practical tradeoffs
- query patterns for dashboards and potential memory reads

Expected output:

- schema design
- migration plan
- DB client setup
- seed strategy if needed

## Prompt 3: Build the backend API

Implement the core backend routes for:

- chat (start/send),
- ingestion,
- conversation listing,
- resume,
- cancel,
- metrics.

Decide where a `MemoryAdapter` interface would sit in the request flow, even if you keep the default implementation as a no‑op or simple local store.

Add validation, error handling, and clean data contracts.  
Keep the API narrow and predictable.

Expected output:

- route handlers
- request/response shapes
- service layer boundaries
- memory integration points
- failure handling strategy

## Prompt 4: Build the logging wrapper

Create the lightweight SDK or wrapper around LLM calls.  
It should capture model, provider, timestamps, latency, token usage, request status, session ID, and redacted previews.  
It must send logs to the ingestion endpoint without blocking the user experience.

Expected output:

- wrapper abstraction
- log payload shape
- retry/fallback behavior
- minimal integration surface

## Prompt 5: Build the chatbot UI

Create the frontend chat experience with multi‑turn conversations.  
Add conversation list, conversation detail, resume, and cancel actions.  
Make the UI simple and professional.

If you implement streaming responses, make sure the UX clearly shows streaming vs final states.

Expected output:

- chat interface
- conversation navigation
- state management
- streaming support if chosen

## Prompt 6: Add ingestion and persistence

Implement the ingestion endpoint that receives logs, validates payloads, extracts metadata, and stores data in the database.  
Make sure chat delivery stays independent from ingestion failures.

Expected output:

- ingestion pipeline
- validation rules
- persistence logic
- graceful failure handling

## Prompt 7: Add observability and dashboards

Add a basic dashboard that shows:

- request volume,
- latency,
- errors,
- optionally provider breakdowns.

Make sure the data flows from stored logs and is easy to understand.

Expected output:

- metrics queries
- dashboard UI
- chart components if needed

## Prompt 8: Add bonus features only if easy

Choose the highest‑signal bonus features that are low‑risk.

Priority order:

1. PII redaction.
2. Streaming responses.
3. Docker Compose one‑command setup.
4. Multi‑provider support.
5. Event‑based architecture.

Do not add a bonus if it threatens completion speed.

## Prompt 9: Write the documentation

Write the README, architecture notes, schema notes, and tradeoff notes.  
Explain the system as if a founder and engineer are reviewing it quickly.

Document:

- what you built,
- why you built it that way,
- how the logging/ingestion pipeline works,
- where a memory layer like Mem0 could be integrated,
- what you would improve with more time.

## Prompt 10: Polish the demo

Run the project end to end.  
Fix rough edges.  
Prepare screenshots or a short Loom.  
Make sure the demo shows the flow from chat request to ingestion to stored logs and metrics.

Expected output:

- working local demo
- clean walkthrough
- clear explanation of flow

## Prompt 11: Final review checklist

Before submission, verify:

- repo structure matches the plan
- app runs locally
- ingestion works
- logs persist
- conversation list/detail/resume/cancel work
- README is complete
- architecture notes are complete
- demo is ready
- memory integration points are clearly explained (even if not implemented)

## Prompt 12: Session hygiene for AI logs

Goal: Make the Cursor/Claude logs themselves look like a clear, intentional engineering story that you can later send to Mem0 as your “AI workflow”.

When using AI tools on this project:

- Start each phase with a short objective  
  “I’m working on X now. Help me design/implement/review Y.”

- Work in small increments  
  Ask for one layer at a time (schema, one endpoint, one component), not the whole project.

- Summarize decisions  
  After a chunk of changes, ask: “Summarize what we just did and why.”

- Call out tradeoffs  
  Explicitly ask: “What are the tradeoffs of this approach vs [alternative]?”

- Avoid secrets and noise  
  Never paste real secrets or sensitive data. If the conversation becomes messy, start a fresh one and briefly recap.

- Show debugging  
  When something breaks, describe the bug, show the error, and ask for a fix + explanation instead of random poking.

The goal is that, when someone reads the logs, it feels like a deliberate, step‑by‑step build, not random chat.

## Working style rules

- Keep changes small and sequential.
- Do not skip ahead.
- After each prompt, verify the output before continuing.
- Prefer simple, readable implementation over broad architecture.
- If a step starts getting large, stop and split it into smaller substeps.