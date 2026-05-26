import os
import redis.asyncio as aioredis

redis = None

async def init_redis():
    global redis
    url = os.getenv('REDIS_URL')
    if not url:
        return
    redis = aioredis.from_url(url, decode_responses=True)

async def close_redis():
    global redis
    if redis:
        await redis.close()

