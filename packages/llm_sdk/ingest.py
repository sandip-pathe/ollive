import os
import asyncio
import httpx

INGEST_URL = os.getenv('INGEST_URL', 'http://localhost:8000/api/ingest/logs')

async def emit_log(payload: dict):
    """Fire-and-forget send to ingestion endpoint. Non-blocking wrapper."""
    async def _send(p):
        try:
            async with httpx.AsyncClient() as client:
                await client.post(INGEST_URL, json=p, timeout=5.0)
        except Exception:
            # swallow errors; ingestion failures shouldn't block
            return

    asyncio.create_task(_send(payload))

