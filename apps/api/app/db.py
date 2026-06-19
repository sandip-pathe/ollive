import os
import asyncpg

pool = None

async def ensure_core_schema():
    if pool is None:
        return

    async with pool.acquire() as conn:
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_call_count INTEGER NOT NULL DEFAULT 0"
        )

async def init_db():
    global pool
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL not set')
    pool = await asyncpg.create_pool(dsn=database_url)
    await ensure_core_schema()
    from .risk_classifier import ensure_risk_schema

    await ensure_risk_schema(pool)

async def close_db():
    global pool
    if pool:
        await pool.close()
