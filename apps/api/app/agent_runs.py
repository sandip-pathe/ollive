from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import db
from .agent_runtime import fetch_agent_run, list_agent_runs, upsert_agent_run, insert_agent_run_steps
from .collector_auth import require_ingest_access
from .risk_classifier import generate_agent_run_evidence_packet, get_agent_run_evidence_packet

router = APIRouter(prefix="/v1")


class AgentIdentity(BaseModel):
    name: str = Field(min_length=1)
    version: str | None = None
    environment: str | None = None


class AgentTask(BaseModel):
    input: str | dict[str, Any] | list[Any]
    type: str | None = None
    customer_id: str | None = None
    thread_id: str | None = None


class AgentOutcome(BaseModel):
    status: str = Field(default="unknown")
    summary: str | None = None
    side_effects: list[dict[str, Any]] = Field(default_factory=list)


class AgentRunStep(BaseModel):
    step_id: str | None = None
    type: str = Field(min_length=1)
    timestamp: datetime | None = None
    name: str | None = None
    status: str = "unknown"
    input: Any = Field(default_factory=dict)
    output: Any = Field(default_factory=dict)
    error: Any = None
    evidence_ref: str | None = None


class AgentRunIn(BaseModel):
    run_id: str | None = None
    tenant_id: str | None = None
    trace_id: str | None = None
    conversation_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    agent: AgentIdentity
    task: AgentTask
    context: dict[str, Any] = Field(default_factory=dict)
    authority: dict[str, Any] = Field(default_factory=dict)
    steps: list[AgentRunStep] = Field(default_factory=list)
    outcome: AgentOutcome = Field(default_factory=AgentOutcome)
    evidence: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_id: str | None = None


class AgentRunEventsIn(BaseModel):
    steps: list[AgentRunStep] = Field(default_factory=list)


def _get_pool():
    if db.pool is None:
        raise HTTPException(status_code=503, detail="Database is still starting up")
    return db.pool


def _model_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


@router.post("/runs", dependencies=[Depends(require_ingest_access)])
async def create_agent_run(payload: AgentRunIn):
    data = _model_dict(payload)
    async with _get_pool().acquire() as conn:
        async with conn.transaction():
            run_id = await upsert_agent_run(conn, data, source="json")
            packet = await generate_agent_run_evidence_packet(conn, run_id)
            run = await fetch_agent_run(conn, run_id)
    return {"run": run, "evidence_packet": packet}


@router.get("/runs", dependencies=[Depends(require_ingest_access)])
async def get_agent_runs(limit: int = 100):
    async with _get_pool().acquire() as conn:
        return await list_agent_runs(conn, limit=limit)


@router.get("/runs/{run_id}", dependencies=[Depends(require_ingest_access)])
async def get_agent_run(run_id: str):
    async with _get_pool().acquire() as conn:
        run = await fetch_agent_run(conn, run_id)
    if not run:
        raise HTTPException(404, "AgentRun not found")
    return run


@router.post("/runs/{run_id}/events", dependencies=[Depends(require_ingest_access)])
async def append_agent_run_events(run_id: str, payload: AgentRunEventsIn):
    if not payload.steps:
        raise HTTPException(
            status_code=422,
            detail={
                "problem": "No AgentRun events supplied",
                "cause": "The request body must include at least one step.",
                "fix": "Send {\"steps\":[{\"type\":\"model_call\",\"status\":\"success\"}]} or another valid AgentRun step.",
            },
        )
    steps = [_model_dict(step) for step in payload.steps]
    async with _get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"ollive:run:{run_id}")
            run = await fetch_agent_run(conn, run_id)
            if not run:
                raise HTTPException(404, "AgentRun not found")
            await insert_agent_run_steps(conn, run_id, steps)
            packet = await generate_agent_run_evidence_packet(conn, run_id)
            updated = await fetch_agent_run(conn, run_id)
    return {"run": updated, "evidence_packet": packet}


@router.get("/runs/{run_id}/evidence-packet", dependencies=[Depends(require_ingest_access)])
async def read_agent_run_evidence_packet(run_id: str):
    async with _get_pool().acquire() as conn:
        try:
            return await get_agent_run_evidence_packet(conn, run_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc


@router.post("/runs/{run_id}/evidence-packet/recompute", dependencies=[Depends(require_ingest_access)])
async def recompute_agent_run_evidence_packet(run_id: str):
    async with _get_pool().acquire() as conn:
        try:
            return await generate_agent_run_evidence_packet(conn, run_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
