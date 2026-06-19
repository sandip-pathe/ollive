# Database Package

This package contains the Postgres schema and database notes for Ollive.

## Files

- `schema.sql` - canonical SQL schema for local development and deploy bootstrap.
- `seed.sql` - optional local seed data.
- `async_db.py` - async database helper experiments.
- `migration_plan.md` - notes for moving from schema bootstrap to migrations.

## Current Tables

- `users`
- `conversations`
- `messages`
- `traces`
- `trace_events`
- `inference_logs`
- `extracted_metadata`
- `agent_policy_rules`
- `agent_risk_events`
- `evidence_packets`
- `memories`

## Apply Locally

With Docker Compose running:

```bash
Get-Content packages/database/schema.sql | docker compose exec -T postgres psql -U ollive -d ollive_dev
```

The API also guards the newest columns and risk/evidence tables on startup so older local databases can continue to boot.
