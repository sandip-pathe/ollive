# Ship Readiness

## v0.1 Status

Ollive v0.1 is an experimental, single-trust-domain reference implementation
for turning Ollive-formatted AgentRuns into risk evidence packets.

Shipped:

- JSON AgentRun collector and first-party TypeScript SDK
- persisted runs, ordered steps, source references, findings, and packets
- deterministic `agentic_insurance_v1` policy evaluation
- optional BYOK AI findings constrained to review-only provenance
- machine-readable experimental assessment and evidence-quality gaps
- existing chat-as-agent path and run-first Inspect dashboard
- local Docker Compose reference stack with schema bootstrap and health gates
- reproducible SDK tarball checks, API/shared tests, web build, and CI matrix
- MIT license, security/support boundaries, changelog, and release checklist

## Accurate Claim

> Ollive is an experimental open-source reference implementation that turns
> Ollive-formatted AgentRuns into risk evidence packets.

The phrase `open-source risk layer for AI-agent observability` describes the
project thesis. It is not a current maturity, adoption, or category-leadership
claim.

Do not claim that Ollive:

- is a production LangSmith, OpenTelemetry, or observability replacement
- ships LangSmith, OpenTelemetry, Python, or framework adapters
- has externally validated or calibrated policy findings
- determines safety, compliance, insurability, underwriting, or coverage
- provides tenant isolation, production retention, or hardened deployment
- offers a support SLA, guaranteed maintenance, or hosted service

## Release Gate

The source tag is ready only when all of these pass:

```bash
python -m py_compile apps/api/app/auth.py apps/api/app/collector_auth.py apps/api/app/db.py apps/api/app/main.py apps/api/app/routes.py apps/api/app/trace_runtime.py apps/api/app/risk_classifier.py apps/api/app/agent_runtime.py apps/api/app/agent_runs.py
python -m unittest discover -s apps/api/tests -v
python -m unittest discover -s packages/shared/tests -v
```

```bash
cd apps/web
npm ci
npx tsc --noEmit --pretty false
npx eslint
npm run build
```

```bash
cd packages/ollive-js
npm ci
npm run typecheck
npm run typecheck:examples
npm run build
npm run test:package
```

```bash
docker compose config --quiet
python scripts/smoke_reference_stack.py
git diff --check
```

The smoke script must use a fresh isolated volume, create one run, fetch the
same packet, expose experimental status, and clean up. Docker unavailability is
the only acceptable unverified environment condition and must be reported.

## Production Gaps

- Tenant-scoped identity, authorization, and audit controls
- TLS, secret management, restricted networking, hardened images, and backups
- Data minimization, retention enforcement, deletion workflows, and privacy review
- Durable queueing, retries, alerts, review workflows, and operational runbooks
- Versioned database migrations and supported rollback/upgrade procedures
- Signed evidence, calibrated scoring, larger policy corpus, and external review
- Vendor/framework adapters and independently verified integration examples

These are future project decisions, not unfinished v0.1 promises.

## Maintenance Position

Issues and pull requests may be opened, but no response, fix, release, or
continued-maintenance timeline is guaranteed. After v0.1, feature work should
resume only when an external user demonstrates a concrete integration or packet
need.
