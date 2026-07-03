# Release Checklist

Use this before pushing a milestone or cutting an OSS release.

## Scope

- Confirm `linkedin-content/` and unrelated files are not staged.
- Confirm README claims match shipped code.
- Confirm `docs/ship-readiness.md` is current.
- Confirm screenshots are still representative after UI changes.

## API

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/db.py apps/api/app/main.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py apps/api/app/agent_runtime.py apps/api/app/agent_runs.py
python -m unittest discover -s apps/api/tests
```

## Web

```bash
cd apps/web
npx tsc --noEmit --pretty false
npx eslint
```

## SDK

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
```

## Runtime

```bash
docker compose up -d --build
docker compose ps
Invoke-WebRequest http://localhost:8001/health
Invoke-WebRequest http://localhost:3000
```

Create one run through `/v1/runs`, open `/inspect`, recompute the packet, and
export JSON.

## Git

```bash
git diff --check
git status --short --branch
```

Make milestone-sized commits with explicit messages.
