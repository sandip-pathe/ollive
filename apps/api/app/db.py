import os
import asyncpg

pool = None

async def init_db():
    global pool
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL not set')
    pool = await asyncpg.create_pool(dsn=database_url)

async def close_db():
    global pool
    if pool:
        await pool.close()

