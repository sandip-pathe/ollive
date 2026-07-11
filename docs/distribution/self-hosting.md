# Local Reference Stack

Ollive runs without an Ollive-hosted service. The included Docker Compose file
is an experimental, single-trust-domain development/reference stack. It is not
a production self-hosting profile.

Prerequisites: Git, Docker Desktop or Docker Engine with Compose v2, and ports
`3000`, `8001`, `5433`, and `6380` available.

```bash
cp .env.example .env
docker compose up -d --build --wait
```

Local services:

- Web: `http://localhost:3000`
- API: `http://localhost:8001`
- API docs: `http://localhost:8001/docs`
- Postgres: `ollive_dev`
- Redis: local queue/cache

The first Postgres volume automatically runs `packages/database/schema.sql`.
Postgres, Redis, and API health gates prevent dependent services from starting
against an uninitialized dependency.

## Configuration

For local development:

```bash
AUTH_BYPASS=true
NEXT_PUBLIC_AUTH_BYPASS=true
```

For a non-local experiment inside one trusted network, disable the UI/API auth
bypass and set independent random secrets:

```bash
AUTH_BYPASS=false
NEXT_PUBLIC_AUTH_BYPASS=false
AUTH_INVITE_CODE=<long random invite>
AUTH_SESSION_SECRET=<long random secret>
OLLIVE_INGEST_TOKEN=<long random collector token>
```

This does not create tenant isolation. `tenant_id` is caller-supplied metadata,
and the ingest token grants access to the collector as a whole. Do not expose
this profile to the public internet.

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

The AI analyzer sends task and step evidence to the configured OpenAI-compatible
chat-completions endpoint and stores AI findings as review-only provenance. Do
not enable it for sensitive evidence without reviewing that provider boundary.

## Persistence

Postgres stores:

- chat traces and messages
- normalized `AgentRun` rows
- ordered `agent_run_steps`
- source payload references
- policy rules
- risk events
- evidence packets

`packages/database/schema.sql` is the canonical bootstrap schema for fresh
installs. v0.1 has no supported in-place migration or rollback workflow. Back up
the Postgres volume before changing versions; for disposable evaluation data,
reset with `docker compose down -v` and start clean.

## Fresh Install Smoke Test

```bash
python scripts/smoke_reference_stack.py
```

The script uses the isolated Compose project `ollive-v010-smoke`, waits for
Postgres, Redis, API, and web readiness, creates and fetches one packet, and
always removes its containers and volumes. Exit code `2` means Docker itself was
unavailable.

For a stack you want to keep running, create a run manually:

```bash
curl -X POST http://localhost:8001/v1/runs \
  -H "Content-Type: application/json" \
  -d '{"agent":{"name":"claims-agent"},"task":{"input":"How do I file a claim?"},"outcome":{"status":"success"},"steps":[{"type":"model_call","status":"success","output":{"text":"A specialist reviews submitted claim materials."}}]}'
```

Open `http://localhost:3000/inspect` and verify the risk posture and packet.

## Common Failures

| Symptom | Check | Fix |
|---|---|---|
| API never becomes healthy | `docker compose logs api postgres` | Confirm the schema mount is readable and database credentials agree. |
| Collector returns 401 | `OLLIVE_INGEST_TOKEN` | Send the same value as `X-Ollive-Token` or Bearer token. |
| Web cannot reach API | `NEXT_PUBLIC_API_BASE` | Use a URL reachable by the browser, normally `http://localhost:8001`. |
| AI review is disabled | packet `audit_trail.ai_analyzer` | This is expected unless both the enable flag and BYOK key are set. |
| Existing data is incompatible | Back up the volume | v0.1 has no supported in-place migration; use a clean disposable volume. |

See [SECURITY.md](../../SECURITY.md) before adapting this stack for sensitive
evidence.
