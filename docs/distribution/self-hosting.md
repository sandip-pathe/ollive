# Self-Hosting Ollive

Ollive is designed to run without an Ollive-hosted service.

The default self-host path is Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

Local services:

- Web: `http://localhost:3000`
- API: `http://localhost:8001`
- API docs: `http://localhost:8001/docs`
- Postgres: `ollive_dev`
- Redis: local queue/cache

## Required Configuration

For local development:

```bash
AUTH_BYPASS=true
NEXT_PUBLIC_AUTH_BYPASS=true
```

For shared or production-like environments:

```bash
AUTH_BYPASS=false
NEXT_PUBLIC_AUTH_BYPASS=false
AUTH_INVITE_CODE=<long random invite>
AUTH_SESSION_SECRET=<long random secret>
OLLIVE_INGEST_TOKEN=<long random collector token>
```

Send the collector token as:

```text
X-Ollive-Token: <token>
```

or:

```text
Authorization: Bearer <token>
```

## Optional AI Review

Deterministic risk packets do not require an AI key.

Optional BYOK AI review is enabled only when:

```bash
OLLIVE_AI_ANALYSIS_ENABLED=true
OLLIVE_AI_API_KEY=<key>
```

The AI analyzer uses an OpenAI-compatible chat-completions endpoint and stores
AI findings as review-only provenance.

## Persistence

Postgres stores:

- chat traces and messages
- normalized `AgentRun` rows
- ordered `agent_run_steps`
- source payload references
- policy rules
- risk events
- evidence packets

The API guards required schema columns on startup. `packages/database/schema.sql`
is the canonical bootstrap schema for fresh installs.

## Fresh Install Smoke Test

```bash
Invoke-WebRequest http://localhost:8001/health
Invoke-WebRequest http://localhost:3000
```

Then create a run:

```bash
curl -X POST http://localhost:8001/v1/runs \
  -H "Content-Type: application/json" \
  -d '{"agent":{"name":"claims-agent"},"task":{"input":"How do I file a claim?"},"outcome":{"status":"success"},"steps":[{"type":"model_call","status":"success","output":{"text":"A specialist reviews submitted claim materials."}}]}'
```

Open `http://localhost:3000/inspect` and verify the risk posture and packet.
