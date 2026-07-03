from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os

app = FastAPI(title="ollive-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy import to avoid circulars
from .db import init_db, close_db
from .redis_client import init_redis, close_redis
from .auth import router as auth_router
from .routes import router
from .trace_runtime import router as trace_router
from .agent_runs import router as agent_runs_router

app.include_router(auth_router)
app.include_router(router)
app.include_router(trace_router)
app.include_router(agent_runs_router)

@app.on_event("startup")
async def startup_event():
    await init_db()
    await init_redis()

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()
    await close_redis()

@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})

@app.get("/")
async def root():
    return {"message": "Ollive API scaffold"}

