from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from . import db
from .auth import get_current_user, require_current_user
from .risk_classifier import generate_evidence_packet, get_evidence_packet, mark_evidence_packet_error

router = APIRouter(prefix="/api")


def now_ms() -> int:
    return int(time.time() * 1000)


def _get_pool():
    if db.pool is None:
        raise HTTPException(status_code=503, detail="Database is still starting up")
    return db.pool


async def create_trace(
    conn,
    *,
    trace_id: UUID,
    conversation_id: UUID,
    message_id: UUID,
    session_id: str,
    provider: str,
    model: str,
    status: str,
    user_preview: str,
    raw_request_json: dict[str, Any],
    retry_count: int = 0,
    pii_detected: bool = False,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    seed: int | None = None,
    provider_fallback: str | None = None,
    interruption_reason: str | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO traces (
          trace_id, conversation_id, message_id, session_id,
          provider, model, started_at, status,
          retry_count, provider_fallback, pii_detected,
          interruption_reason, user_preview, assistant_preview,
          raw_request_json, raw_response_json, created_at,
          temperature, top_p, max_tokens, seed,
          request_payload_size, message_count, context_length
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24
        )
        """,
        trace_id,
        conversation_id,
        message_id,
        session_id,
        provider,
        model,
        now_ms(),
        status,
        retry_count,
        provider_fallback,
        pii_detected,
        interruption_reason,
        user_preview,
        "",
        json.dumps(raw_request_json),
        None,
        now_ms(),
        temperature,
        top_p,
        max_tokens,
        seed,
        len(json.dumps(raw_request_json).encode("utf-8")),
        int(raw_request_json.get("message_count", 0)),
        int(raw_request_json.get("context_length", 0)),
    )


async def emit_trace_event(
    conn,
    trace_id: UUID,
    event_type: str,
    payload: dict[str, Any],
    duration_ms: int | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO trace_events (trace_id, type, timestamp, duration_ms, payload)
        VALUES ($1, $2, $3, $4, $5)
        """,
        trace_id,
        event_type,
        now_ms(),
        duration_ms,
        json.dumps(payload),
    )


async def finalize_trace(
    conn,
    *,
    trace_id: UUID,
    status: str,
    assistant_preview: str,
    completed_at_ms: int,
    latency_ms: int,
    ttft_ms: int | None,
    stream_duration_ms: int | None,
    chunks_count: int,
    total_tokens: int | None,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    estimated_cost_usd: float | None,
    interruption_reason: str | None,
    finish_reason: str | None,
    raw_response_json: dict[str, Any] | None,
    avg_tokens_per_second: float | None = None,
    response_payload_size: int | None = None,
) -> None:
    await conn.execute(
        """
        UPDATE traces
        SET completed_at=$2,
            latency_ms=$3,
            ttft_ms=$4,
            stream_duration_ms=$5,
            chunks_count=$6,
            total_tokens=$7,
            prompt_tokens=$8,
            completion_tokens=$9,
            estimated_cost_usd=$10,
            interruption_reason=$11,
            finish_reason=$12,
            raw_response_json=$13,
            assistant_preview=$14,
            status=$15,
            avg_tokens_per_second=$16,
            response_payload_size=$17
        WHERE trace_id=$1
        """,
        trace_id,
        completed_at_ms,
        latency_ms,
        ttft_ms,
        stream_duration_ms,
        chunks_count,
        total_tokens,
        prompt_tokens,
        completion_tokens,
        estimated_cost_usd,
        interruption_reason,
        finish_reason,
        json.dumps(raw_response_json) if raw_response_json is not None else None,
        assistant_preview,
        status,
        avg_tokens_per_second,
        response_payload_size,
    )


@router.get("/traces", dependencies=[Depends(require_current_user)])
async def list_traces(conversation_id: UUID | None = None, limit: int = 100):
    current_user = get_current_user()
    limit = max(1, min(limit, 250))
    async with _get_pool().acquire() as conn:
        if conversation_id:
            rows = await conn.fetch(
                """
                SELECT
                  t.*,
                  COUNT(e.id) AS events_count
                FROM traces t
                LEFT JOIN trace_events e ON e.trace_id = t.trace_id
                JOIN conversations c ON c.id = t.conversation_id
                WHERE c.actor_id = $1 AND t.conversation_id = $2
                GROUP BY t.trace_id
                ORDER BY t.created_at DESC
                LIMIT $3
                """,
                current_user.id,
                conversation_id,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                  t.*,
                  COUNT(e.id) AS events_count
                FROM traces t
                LEFT JOIN trace_events e ON e.trace_id = t.trace_id
                JOIN conversations c ON c.id = t.conversation_id
                WHERE c.actor_id = $1
                GROUP BY t.trace_id
                ORDER BY t.created_at DESC
                LIMIT $2
                """,
                current_user.id,
                limit,
            )
        return [dict(row) for row in rows]


@router.get("/traces/{trace_id}", dependencies=[Depends(require_current_user)])
async def get_trace(trace_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        trace = await conn.fetchrow("SELECT t.* FROM traces t JOIN conversations c ON c.id=t.conversation_id WHERE t.trace_id=$1 AND c.actor_id=$2", trace_id, current_user.id)
        if not trace:
            raise HTTPException(404, "Trace not found")
        events = await conn.fetch(
            "SELECT * FROM trace_events WHERE trace_id=$1 ORDER BY timestamp ASC",
            trace_id,
        )
        inference_log = await conn.fetchrow(
            """
            SELECT id, trace_id, conversation_id, message_id, provider, model, start_ts, end_ts, latency_ms,
                   tokens_in, tokens_out, status, error, redacted_input_preview,
                   redacted_output_preview, raw_payload, created_at
            FROM inference_logs il
            JOIN conversations c ON c.id = il.conversation_id
            WHERE il.trace_id=$1 AND c.actor_id=$2
            ORDER BY il.created_at DESC
            LIMIT 1
            """,
            trace_id,
            current_user.id,
        )
        extracted_metadata = []
        if inference_log:
            extracted_metadata = await conn.fetch(
                "SELECT key, value, created_at FROM extracted_metadata WHERE inference_log_id=$1 ORDER BY created_at ASC",
                inference_log["id"],
            )
        conv = None
        msgs = []
        if trace["conversation_id"]:
            conv = await conn.fetchrow(
                "SELECT * FROM conversations WHERE id=$1 AND actor_id=$2",
                trace["conversation_id"],
                current_user.id,
            )
            msgs = await conn.fetch(
                "SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC",
                trace["conversation_id"],
            )
        return {
            "trace": dict(trace),
            "events": [dict(row) for row in events],
            "conversation": dict(conv) if conv else None,
            "messages": [dict(row) for row in msgs],
            "inference_log": dict(inference_log) if inference_log else None,
            "extracted_metadata": [dict(row) for row in extracted_metadata],
        }


@router.get("/traces/{trace_id}/evidence-packet", dependencies=[Depends(require_current_user)])
async def get_trace_evidence_packet(trace_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        trace = await conn.fetchrow(
            """
            SELECT t.trace_id
            FROM traces t
            JOIN conversations c ON c.id = t.conversation_id
            WHERE t.trace_id=$1 AND c.actor_id=$2
            """,
            trace_id,
            current_user.id,
        )
        if not trace:
            raise HTTPException(404, "Trace not found")
        return await get_evidence_packet(conn, trace_id)


@router.post("/traces/{trace_id}/evidence-packet/recompute", dependencies=[Depends(require_current_user)])
async def recompute_trace_evidence_packet(trace_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        trace = await conn.fetchrow(
            """
            SELECT t.trace_id
            FROM traces t
            JOIN conversations c ON c.id = t.conversation_id
            WHERE t.trace_id=$1 AND c.actor_id=$2
            """,
            trace_id,
            current_user.id,
        )
        if not trace:
            raise HTTPException(404, "Trace not found")
        try:
            return await generate_evidence_packet(conn, trace_id)
        except Exception as exc:
            await mark_evidence_packet_error(conn, trace_id, f"Evidence packet generation failed: {exc}")
            return await get_evidence_packet(conn, trace_id)


@router.get("/traces/{trace_id}/events/stream", dependencies=[Depends(require_current_user)])
async def stream_trace_events(trace_id: UUID):
    current_user = get_current_user()
    async def event_stream():
        seen_ids: set[str] = set()
        while True:
            async with _get_pool().acquire() as conn:
                trace = await conn.fetchrow(
                    "SELECT t.status FROM traces t JOIN conversations c ON c.id=t.conversation_id WHERE t.trace_id=$1 AND c.actor_id=$2",
                    trace_id,
                    current_user.id,
                )
                rows = await conn.fetch(
                    "SELECT id, trace_id, type, timestamp, duration_ms, payload FROM trace_events WHERE trace_id=$1 ORDER BY timestamp ASC",
                    trace_id,
                )
            for row in rows:
                event_id = str(row["id"])
                if event_id in seen_ids:
                    continue
                seen_ids.add(event_id)
                yield f"data: {json.dumps(dict(row), default=str)}\n\n"
            if trace and trace["status"] not in {"queued", "streaming"}:
                break
            await asyncio.sleep(0.5)
    return StreamingResponse(event_stream(), media_type="text/event-stream")
