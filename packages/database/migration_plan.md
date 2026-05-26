# Migration Plan

1. Apply `packages/database/schema.sql` to the Postgres instance used for development.
   - `psql "$DATABASE_URL" -f packages/database/schema.sql`
2. Prefer using a migration tool (Alembic/Flyway) for tracked migrations in CI/production.
3. For local dev with Docker Compose, run the psql command inside a one-off container after Postgres is ready.

