# Release Checklist

Use this before cutting an Ollive source tag.

## Scope And Claims

- Confirm Ollive is described as an experimental AgentRun risk-evidence
  reference, not a production or validated decision system.
- Confirm adapters, npm publication, hosted services, and production controls
  are described as unimplemented or out of scope.
- Confirm `linkedin-content/` and unrelated files are not staged.
- Confirm screenshots still match the unchanged UI.

## Python

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/collector_auth.py apps/api/app/db.py apps/api/app/main.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py apps/api/app/agent_runtime.py apps/api/app/agent_runs.py
python -m unittest discover -s apps/api/tests -v
python -m unittest discover -s packages/shared/tests -v
```

## Web

```bash
cd apps/web
npm ci
npx tsc --noEmit --pretty false
npx eslint
npm run build
```

## TypeScript SDK

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
npm run build
npm run test:package
```

CI repeats the SDK checks on Node 18 and Node 22. `test:package` must install
the generated tarball into a temporary ESM/TypeScript consumer and remove it.

## Local Reference Stack

```bash
docker compose config --quiet
python scripts/smoke_reference_stack.py
```

The smoke must start a fresh `ollive-v010-smoke` project, wait for Postgres,
Redis, API, and web, create and fetch the same packet, assert experimental
status, and always execute `down -v`. Only a failed `docker info` may be reported
as an environment-only skip.

## Repository

```bash
git diff --check
git status --short --branch
git diff --cached --name-only
```

- Stage an explicit closeout file allowlist; never use an unreviewed `git add -A`.
- Verify `linkedin-content/` is absent from `git diff --cached --name-only`.
- Verify root and SDK `LICENSE`, `SECURITY.md`, and `CHANGELOG.md` are included.
- Commit the verified closeout, push `main`, create annotated tag `v0.1.0`, and
  push the tag.
- Do not publish npm or create a hosted deployment as part of this release.
