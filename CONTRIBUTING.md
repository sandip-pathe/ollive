# Contributing

Ollive is an experimental reference implementation for risk-oriented AI-agent
observability. The broader risk-layer category is a product thesis, not a
production-readiness claim.

The project is designed so contributors can run it locally and ship changes
without depending on an Ollive-hosted service.

This repository has no support SLA, guaranteed review time, guaranteed fix,
or commitment to continued maintenance. Contributions may be accepted, changed,
or left unanswered. Do not include secrets, customer data, or unredacted traces
in issues or pull requests.

## Local Setup

```bash
cp .env.example .env
docker compose up -d --build --wait
```

For frontend-only work:

```bash
cd apps/web
npm install
npm run dev
```

## Code Areas

- `apps/api` - FastAPI collector, chat, traces, AgentRun ingest, risk packets.
- `apps/web` - Next.js chat and inspect dashboard.
- `packages/ollive-js` - TypeScript SDK.
- `packages/database` - Postgres bootstrap schema.
- `docs` - architecture, integrations, risk, distribution, and release notes.

## Development Rules

- Keep Ollive self-hostable.
- Do not add a dependency on a hosted Ollive service.
- Treat LangSmith, OpenTelemetry, and other observability tools as optional inputs.
- Preserve deterministic risk checks when adding optional AI analysis.
- Make missing evidence visible.
- Add tests for policy and classifier changes.
- Keep docs in sync with claim boundaries.

## Checks

```bash
python -m unittest discover -s apps/api/tests
python -m unittest discover -s packages/shared/tests
```

```bash
cd apps/web
npx tsc --noEmit --pretty false
npx eslint
npm run build
```

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
npm run test:package
```

```bash
docker compose config --quiet
```

## Pull Request Expectations

- Explain the user-facing risk observability improvement.
- Include screenshots for UI changes.
- Include fixture tests for risk engine changes.
- Update relevant docs.
- Keep unrelated files out of the diff.

## Scope Boundary

The local Compose stack is a single-trust-domain development reference. Pull
requests must not present it as a production deployment profile or treat packet
posture as a safety, compliance, underwriting, or insurance decision. New
production claims require corresponding access control, retention, migration,
security, and validation evidence.
