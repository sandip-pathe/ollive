"""Redis-based enrichment worker: pops inference_log ids and extracts metadata."""
import asyncio
import os
import json
import re
import asyncpg
import redis.asyncio as aioredis

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://ollive:changeme@localhost:5432/ollive_dev')
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
WORKER_PORT = int(os.getenv('PORT', '8000'))

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

async def process_inference(pool, infer_id):
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT id, raw_payload, redacted_input_preview, redacted_output_preview FROM inference_logs WHERE id=$1', infer_id)
        if not row:
            return
        raw = row['raw_payload'] or '{}'
        if isinstance(raw, dict):
            raw_s = json.dumps(raw)
        else:
            raw_s = raw
        emails = set(EMAIL_RE.findall(raw_s))
        emails.update(EMAIL_RE.findall(row.get('redacted_input_preview') or ''))
        emails.update(EMAIL_RE.findall(row.get('redacted_output_preview') or ''))
        for e in emails:
            await conn.execute('INSERT INTO extracted_metadata (inference_log_id, key, value) VALUES ($1,$2,$3)', infer_id, 'email', e)
        # try to extract simple keys from raw payload
        try:
            parsed = json.loads(raw_s)
            if isinstance(parsed, dict):
                for k in ('provider','model','status'):
                    if k in parsed and parsed[k]:
                        await conn.execute('INSERT INTO extracted_metadata (inference_log_id, key, value) VALUES ($1,$2,$3)', infer_id, k, str(parsed[k]))
        except Exception:
            pass

async def enrich_loop():
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    pool = await asyncpg.create_pool(dsn=DATABASE_URL)
    try:
        while True:
            res = await redis.blpop('inference_queue', timeout=5)
            if not res:
                await asyncio.sleep(1)
                continue
            _, infer_id = res
            try:
                await process_inference(pool, infer_id)
            except Exception:
                continue
    finally:
        await pool.close()
        await redis.close()


async def health_handler(reader, writer):
    try:
        await reader.readline()
        while True:
            header = await reader.readline()
            if header in (b'\r\n', b'\n', b''):
                break
        writer.write(
            b'HTTP/1.1 200 OK\r\n'
            b'Content-Type: text/plain\r\n'
            b'Content-Length: 2\r\n'
            b'Connection: close\r\n\r\n'
            b'ok'
        )
        await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def serve_health():
    server = await asyncio.start_server(health_handler, '0.0.0.0', WORKER_PORT)
    async with server:
        await server.serve_forever()


async def main():
    await asyncio.gather(enrich_loop(), serve_health())

if __name__ == '__main__':
    asyncio.run(main())
