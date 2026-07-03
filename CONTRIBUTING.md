# Contributing

Ollive is the open-source risk layer for AI-agent observability.

The project is designed so contributors can run it locally and ship changes
without depending on an Ollive-hosted service.

## Local Setup

```bash
cp .env.example .env
docker compose up -d --build
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
```

```bash
cd apps/web
npx tsc --noEmit --pretty false
npx eslint
```

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
```

## Pull Request Expectations

- Explain the user-facing risk observability improvement.
- Include screenshots for UI changes.
- Include fixture tests for risk engine changes.
- Update relevant docs.
- Keep unrelated files out of the diff.
