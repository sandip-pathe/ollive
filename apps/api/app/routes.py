from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
from uuid import UUID, uuid4
from typing import Any
import json
import os
from . import db
from .auth import get_current_user, require_current_user
from .collector_auth import require_ingest_access
from .trace_runtime import create_trace, emit_trace_event, finalize_trace, now_ms
from .risk_classifier import mark_evidence_packet_pending, schedule_evidence_packet
from packages.shared.redaction import redact_text, redact_preview
from packages.llm_sdk.openai_stream import stream_chat

router = APIRouter(prefix="/api")

MAX_CALLS_PER_USER = int(os.getenv("MAX_CALLS_PER_USER", "1000"))

class ConversationCreate(BaseModel):
    title: str | None = None

class MessageCreate(BaseModel):
    role: str
    content: str
    save_memories: bool | None = False

class IngestLog(BaseModel):
    provider: str
    model: str | None = None
    conversation_id: UUID | None = None
    message_id: UUID | None = None
    start_ts: str | None = None
    end_ts: str | None = None
    latency_ms: int | None = None
    status: str | None = None
    redacted_input_preview: str | None = None
    redacted_output_preview: str | None = None


def _get_pool():
    if db.pool is None:
        raise HTTPException(status_code=503, detail="Database is still starting up")
    return db.pool


def _message_context(rows):
    return [
        {"role": row["role"], "content": row["content"] or ""}
        for row in reversed(rows)
        if row["content"] is not None
    ]


async def _owned_conversation(conn, conv_id: UUID, user_id: UUID):
    return await conn.fetchrow(
        "SELECT * FROM conversations WHERE id=$1 AND actor_id=$2",
        conv_id,
        user_id,
    )


async def _consume_user_call_quota(conn, user_id: UUID):
    row = await conn.fetchrow(
        """
        UPDATE users
        SET llm_call_count = llm_call_count + 1
        WHERE id = $1 AND llm_call_count < $2
        RETURNING llm_call_count
        """,
        user_id,
        MAX_CALLS_PER_USER,
    )
    if not row:
        raise HTTPException(
            status_code=429,
            detail=f"Call cap reached ({MAX_CALLS_PER_USER}). Contact the owner for a reset.",
        )


@router.post("/conversations", dependencies=[Depends(require_current_user)])
async def create_conversation(payload: ConversationCreate):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO conversations (title, actor_id) VALUES ($1, $2) RETURNING id, title, status, created_at",
            payload.title,
            current_user.id,
        )
        return dict(row)


@router.get("/conversations", dependencies=[Depends(require_current_user)])
async def list_conversations():
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        rows = await conn.fetch("SELECT id, title, status, created_at FROM conversations WHERE actor_id=$1 ORDER BY created_at DESC", current_user.id)
        return [dict(r) for r in rows]


@router.get("/conversations/{conv_id}", dependencies=[Depends(require_current_user)])
async def get_conversation(conv_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        conv = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        if not conv:
            raise HTTPException(404, "Conversation not found")
        msgs = await conn.fetch("SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC", conv_id)
        return {"conversation": dict(conv), "messages": [dict(m) for m in msgs]}


@router.post("/conversations/{conv_id}/messages", dependencies=[Depends(require_current_user)])
async def create_message(conv_id: UUID, payload: MessageCreate):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        conv = await conn.fetchrow("SELECT id FROM conversations WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        if not conv:
            raise HTTPException(404, "Conversation not found")
        await _consume_user_call_quota(conn, current_user.id)
        redacted, _redactions = redact_text(payload.content)
        msg = await conn.fetchrow(
            "INSERT INTO messages (conversation_id, role, content, content_redacted) VALUES ($1,$2,$3,true) RETURNING *",
            conv_id,
            payload.role,
            redacted,
        )
        infer = await conn.fetchrow(
            "INSERT INTO inference_logs (provider, model, conversation_id, message_id, status, redacted_input_preview) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            'openai', 'gpt-4o-mini', conv_id, msg['id'], 'queued', redact_preview(payload.content),
        )
        return {"message": dict(msg), "inference_log_id": infer['id']}


@router.post("/conversations/{conv_id}/messages/stream", dependencies=[Depends(require_current_user)])
async def stream_message(conv_id: UUID, payload: MessageCreate):
    current_user = get_current_user()
    trace_id = uuid4()
    started_at_ms = now_ms()
    first_token_ms: int | None = None
    assistant_text = ''
    chunk_count = 0
    final_status = 'cancelled'
    finish_reason: str | None = None
    user_preview = redact_preview(payload.content)
    pii_detected = user_preview != payload.content

    async with _get_pool().acquire() as conn:
        conv = await conn.fetchrow("SELECT id FROM conversations WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        if not conv:
            raise HTTPException(404, "Conversation not found")
        await _consume_user_call_quota(conn, current_user.id)
        redacted, _redactions = redact_text(payload.content)
        user_msg = await conn.fetchrow(
            "INSERT INTO messages (conversation_id, role, content, content_redacted) VALUES ($1,$2,$3,true) RETURNING *",
            conv_id,
            payload.role,
            redacted,
        )
        history_rows = await conn.fetch(
            """
            SELECT role, content
            FROM messages
            WHERE conversation_id=$1
            ORDER BY created_at DESC
            LIMIT 8
            """,
            conv_id,
        )
        context_messages = _message_context(history_rows)
        assistant_msg = await conn.fetchrow(
            "INSERT INTO messages (conversation_id, role, content, content_redacted) VALUES ($1,$2,$3,false) RETURNING id",
            conv_id,
            'assistant',
            '',
        )
        request_payload = {
            'role': payload.role,
            'content': payload.content,
            'save_memories': payload.save_memories,
            'message_count': len(context_messages),
            'context_length': sum(len(item.get('content', '')) for item in context_messages),
        }
        await create_trace(
            conn,
            trace_id=trace_id,
            conversation_id=conv_id,
            message_id=assistant_msg['id'],
            session_id=str(conv_id),
            provider='openai',
            model='gpt-4o-mini',
            status='streaming',
            user_preview=user_preview,
            raw_request_json=request_payload,
            retry_count=0,
            pii_detected=pii_detected,
        )
        infer = await conn.fetchrow(
            "INSERT INTO inference_logs (trace_id, provider, model, conversation_id, message_id, status, redacted_input_preview) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            trace_id,
            'openai',
            'gpt-4o-mini',
            conv_id,
            user_msg['id'],
            'streaming',
            user_preview,
        )
        await emit_trace_event(
            conn,
            trace_id,
            'request_started',
            {
                'provider': 'openai',
                'model': 'gpt-4o-mini',
                'conversation_id': str(conv_id),
                'message_id': str(assistant_msg['id']),
                'message_count': len(context_messages),
                'context_length': request_payload['context_length'],
            },
        )

    async def record_trace_event(event_type: str, event_payload: dict[str, Any]):
        async with _get_pool().acquire() as conn:
            await emit_trace_event(conn, trace_id, event_type, event_payload)

    async def queue_evidence_packet(conn):
        try:
            await mark_evidence_packet_pending(conn, trace_id)
            schedule_evidence_packet(trace_id)
        except Exception:
            pass

    async def event_stream():
        nonlocal assistant_text, first_token_ms, chunk_count, final_status, finish_reason
        try:
            async with _get_pool().acquire() as conn:
                await conn.execute("UPDATE conversations SET status='active' WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
                await emit_trace_event(
                    conn,
                    trace_id,
                    'provider_connected',
                    {
                        'provider': 'openai',
                        'model': 'gpt-4o-mini',
                    },
                )

            async for chunk in stream_chat(
                context_messages,
                trace_id=str(trace_id),
                emit_event=record_trace_event,
            ):
                assistant_text += chunk
                chunk_count += 1
                if first_token_ms is None:
                    first_token_ms = now_ms()
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

            final_status = 'success'
            finish_reason = 'stop'
            completed_at_ms = now_ms()
            latency_ms = completed_at_ms - started_at_ms
            ttft_ms = (first_token_ms - started_at_ms) if first_token_ms is not None else None
            stream_duration_ms = (completed_at_ms - first_token_ms) if first_token_ms is not None else latency_ms
            prompt_tokens = max(1, sum(len(item.get('content', '').split()) for item in context_messages)) if context_messages else 0
            completion_tokens = max(1, len(assistant_text.split())) if assistant_text else 0
            total_tokens = prompt_tokens + completion_tokens
            avg_tokens_per_second = round((completion_tokens / max(stream_duration_ms, 1)) * 1000, 2) if completion_tokens else 0
            estimated_cost_usd = round(total_tokens * 0.0000012, 6)
            raw_response_json = {
                'provider': 'openai',
                'model': 'gpt-4o-mini',
                'assistant_preview': redact_preview(assistant_text),
                'chunks_count': chunk_count,
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': total_tokens,
            }
            async with _get_pool().acquire() as conn:
                await emit_trace_event(
                    conn,
                    trace_id,
                    'stream_completed',
                    {
                        'assistant_preview': redact_preview(assistant_text),
                        'chunks_count': chunk_count,
                        'finish_reason': finish_reason,
                    },
                )
                await finalize_trace(
                    conn,
                    trace_id=trace_id,
                    status=final_status,
                    assistant_preview=redact_preview(assistant_text),
                    completed_at_ms=completed_at_ms,
                    latency_ms=latency_ms,
                    ttft_ms=ttft_ms,
                    stream_duration_ms=stream_duration_ms,
                    chunks_count=chunk_count,
                    total_tokens=total_tokens,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    estimated_cost_usd=estimated_cost_usd,
                    interruption_reason=None,
                    finish_reason=finish_reason,
                    raw_response_json=raw_response_json,
                    avg_tokens_per_second=avg_tokens_per_second,
                    response_payload_size=len(json.dumps(raw_response_json).encode('utf-8')),
                )
                await conn.execute(
                    "UPDATE messages SET content=$1 WHERE id=$2",
                    assistant_text,
                    assistant_msg['id'],
                )
                await conn.execute(
                    "UPDATE inference_logs SET status=$1, redacted_output_preview=$2, message_id=$3 WHERE id=$4",
                    final_status,
                    redact_preview(assistant_text) if assistant_text else None,
                    assistant_msg['id'],
                    infer['id'],
                )
                await queue_evidence_packet(conn)
            yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg['id'])})}\n\n"
        except asyncio.CancelledError:
            final_status = 'cancelled'
            interruption_reason = 'user_paused_or_cancelled'
            completed_at_ms = now_ms()
            latency_ms = completed_at_ms - started_at_ms
            ttft_ms = (first_token_ms - started_at_ms) if first_token_ms is not None else None
            stream_duration_ms = (completed_at_ms - first_token_ms) if first_token_ms is not None else latency_ms
            prompt_tokens = max(1, sum(len(item.get('content', '').split()) for item in context_messages)) if context_messages else 0
            completion_tokens = max(1, len(assistant_text.split())) if assistant_text else 0
            total_tokens = prompt_tokens + completion_tokens
            avg_tokens_per_second = round((completion_tokens / max(stream_duration_ms, 1)) * 1000, 2) if completion_tokens else 0
            estimated_cost_usd = round(total_tokens * 0.0000012, 6)
            raw_response_json = {
                'provider': 'openai',
                'model': 'gpt-4o-mini',
                'assistant_preview': redact_preview(assistant_text),
                'chunks_count': chunk_count,
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': total_tokens,
            }
            async with _get_pool().acquire() as conn:
                await emit_trace_event(
                    conn,
                    trace_id,
                    'cancelled',
                    {
                        'assistant_preview': redact_preview(assistant_text),
                        'chunks_count': chunk_count,
                        'reason': interruption_reason,
                    },
                )
                await finalize_trace(
                    conn,
                    trace_id=trace_id,
                    status=final_status,
                    assistant_preview=redact_preview(assistant_text),
                    completed_at_ms=completed_at_ms,
                    latency_ms=latency_ms,
                    ttft_ms=ttft_ms,
                    stream_duration_ms=stream_duration_ms,
                    chunks_count=chunk_count,
                    total_tokens=total_tokens,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    estimated_cost_usd=estimated_cost_usd,
                    interruption_reason=interruption_reason,
                    finish_reason=finish_reason,
                    raw_response_json=raw_response_json,
                    avg_tokens_per_second=avg_tokens_per_second,
                    response_payload_size=len(json.dumps(raw_response_json).encode('utf-8')),
                )
                await conn.execute(
                    "UPDATE messages SET content=$1 WHERE id=$2",
                    assistant_text,
                    assistant_msg['id'],
                )
                await conn.execute(
                    "UPDATE inference_logs SET status=$1, redacted_output_preview=$2, message_id=$3 WHERE id=$4",
                    final_status,
                    redact_preview(assistant_text) if assistant_text else None,
                    assistant_msg['id'],
                    infer['id'],
                )
                await queue_evidence_packet(conn)
            raise
        except Exception as exc:
            final_status = 'error'
            interruption_reason = str(exc)
            completed_at_ms = now_ms()
            latency_ms = completed_at_ms - started_at_ms
            ttft_ms = (first_token_ms - started_at_ms) if first_token_ms is not None else None
            stream_duration_ms = (completed_at_ms - first_token_ms) if first_token_ms is not None else latency_ms
            prompt_tokens = max(1, sum(len(item.get('content', '').split()) for item in context_messages)) if context_messages else 0
            completion_tokens = max(1, len(assistant_text.split())) if assistant_text else 0
            total_tokens = prompt_tokens + completion_tokens
            avg_tokens_per_second = round((completion_tokens / max(stream_duration_ms, 1)) * 1000, 2) if completion_tokens else 0
            estimated_cost_usd = round(total_tokens * 0.0000012, 6)
            raw_response_json = {
                'provider': 'openai',
                'model': 'gpt-4o-mini',
                'assistant_preview': redact_preview(assistant_text),
                'chunks_count': chunk_count,
                'error': str(exc),
            }
            async with _get_pool().acquire() as conn:
                await emit_trace_event(
                    conn,
                    trace_id,
                    'error',
                    {
                        'message': str(exc),
                        'assistant_preview': redact_preview(assistant_text),
                        'chunks_count': chunk_count,
                    },
                )
                await finalize_trace(
                    conn,
                    trace_id=trace_id,
                    status=final_status,
                    assistant_preview=redact_preview(assistant_text),
                    completed_at_ms=completed_at_ms,
                    latency_ms=latency_ms,
                    ttft_ms=ttft_ms,
                    stream_duration_ms=stream_duration_ms,
                    chunks_count=chunk_count,
                    total_tokens=total_tokens,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    estimated_cost_usd=estimated_cost_usd,
                    interruption_reason=interruption_reason,
                    finish_reason=finish_reason,
                    raw_response_json=raw_response_json,
                    avg_tokens_per_second=avg_tokens_per_second,
                    response_payload_size=len(json.dumps(raw_response_json).encode('utf-8')),
                )
                await conn.execute(
                    "UPDATE messages SET content=$1 WHERE id=$2",
                    assistant_text,
                    assistant_msg['id'],
                )
                await conn.execute(
                    "UPDATE inference_logs SET status=$1, redacted_output_preview=$2, message_id=$3 WHERE id=$4",
                    final_status,
                    redact_preview(assistant_text) if assistant_text else None,
                    assistant_msg['id'],
                    infer['id'],
                )
                await queue_evidence_packet(conn)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

    return StreamingResponse(event_stream(), media_type='text/event-stream')

@router.post("/conversations/{conv_id}/cancel", dependencies=[Depends(require_current_user)])
async def cancel_conv(conv_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        conv = await conn.fetchrow("SELECT id FROM conversations WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        if not conv:
            raise HTTPException(404, "Conversation not found")
        return {"ok": True}


@router.post("/conversations/{conv_id}/pause", dependencies=[Depends(require_current_user)])
async def pause_conv(conv_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        await conn.execute("UPDATE conversations SET status='paused' WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        return {"ok": True}


@router.post("/conversations/{conv_id}/resume", dependencies=[Depends(require_current_user)])
async def resume_conv(conv_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        await conn.execute("UPDATE conversations SET status='active' WHERE id=$1 AND actor_id=$2", conv_id, current_user.id)
        return {"ok": True}


@router.get("/inference-logs", dependencies=[Depends(require_current_user)])
async def list_inference_logs(conversation_id: UUID | None = None, limit: int = 100):
    current_user = get_current_user()
    limit = max(1, min(limit, 250))
    async with _get_pool().acquire() as conn:
        if conversation_id:
            rows = await conn.fetch(
                """
                SELECT id, conversation_id, message_id, provider, model, start_ts, end_ts, latency_ms,
                       tokens_in, tokens_out, status, error, redacted_input_preview,
                       redacted_output_preview, created_at
                FROM inference_logs il
                JOIN conversations c ON c.id = il.conversation_id
                WHERE c.actor_id=$1 AND il.conversation_id=$2
                ORDER BY il.created_at DESC
                LIMIT $3
                """,
                current_user.id,
                conversation_id,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, conversation_id, message_id, provider, model, start_ts, end_ts, latency_ms,
                       tokens_in, tokens_out, status, error, redacted_input_preview,
                       redacted_output_preview, created_at
                FROM inference_logs il
                JOIN conversations c ON c.id = il.conversation_id
                WHERE c.actor_id=$1
                ORDER BY il.created_at DESC
                LIMIT $2
                """,
                current_user.id,
                limit,
            )
        return [dict(r) for r in rows]


@router.get("/inference-logs/{log_id}", dependencies=[Depends(require_current_user)])
async def get_inference_log(log_id: UUID):
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, conversation_id, message_id, provider, model, start_ts, end_ts, latency_ms,
                   tokens_in, tokens_out, status, error, redacted_input_preview,
                   redacted_output_preview, raw_payload, created_at
            FROM inference_logs il
            JOIN conversations c ON c.id = il.conversation_id
            WHERE il.id=$1 AND c.actor_id=$2
            """,
            log_id,
            current_user.id,
        )
        if not row:
            raise HTTPException(404, "Inference log not found")
        metadata = await conn.fetch(
            "SELECT key, value, created_at FROM extracted_metadata WHERE inference_log_id=$1 ORDER BY created_at ASC",
            log_id,
        )
        payload = dict(row)
        payload["extracted_metadata"] = [dict(m) for m in metadata]
        return payload


@router.get("/metrics/overview", dependencies=[Depends(require_current_user)])
async def metrics_overview():
    current_user = get_current_user()
    async with _get_pool().acquire() as conn:
        metrics = await conn.fetchrow(
            """
            SELECT
              COUNT(*) AS requests_today,
              COALESCE(ROUND(AVG(il.latency_ms)::numeric, 1), 0) AS avg_latency_ms,
              COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE il.status = 'error') / NULLIF(COUNT(*), 0), 1), 0) AS error_rate,
              COALESCE(SUM(COALESCE(il.tokens_in, 0) + COALESCE(il.tokens_out, 0)), 0) AS tokens_processed
            FROM inference_logs il
            JOIN conversations c ON c.id = il.conversation_id
            WHERE c.actor_id=$1 AND il.created_at >= date_trunc('day', now())
            """,
                current_user.id,
        )
        conversations = await conn.fetchrow(
            """
            SELECT
              COUNT(*) FILTER (WHERE status = 'active') AS active_conversations,
                            COUNT(*) FILTER (WHERE status = 'paused') AS paused_conversations,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_conversations,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed_conversations
            FROM conversations
            WHERE actor_id=$1
            """
            ,
                current_user.id,
        )
        status_rows = await conn.fetch(
            "SELECT il.status, COUNT(*) AS count FROM inference_logs il JOIN conversations c ON c.id = il.conversation_id WHERE c.actor_id=$1 GROUP BY il.status ORDER BY count DESC",
            current_user.id,
        )
        provider_rows = await conn.fetch(
            "SELECT il.provider, COUNT(*) AS count FROM inference_logs il JOIN conversations c ON c.id = il.conversation_id WHERE c.actor_id=$1 GROUP BY il.provider ORDER BY count DESC LIMIT 6",
            current_user.id,
        )
        recent_errors = await conn.fetch(
            """
            SELECT il.id, il.provider, il.model, il.status, il.error, il.latency_ms, il.created_at
            FROM inference_logs il
            JOIN conversations c ON c.id = il.conversation_id
            WHERE c.actor_id=$1 AND il.status = 'error'
            ORDER BY il.created_at DESC
            LIMIT 5
            """,
            current_user.id,
        )
        return {
            "requests_today": int(metrics["requests_today"] or 0),
            "avg_latency_ms": float(metrics["avg_latency_ms"] or 0),
            "error_rate": float(metrics["error_rate"] or 0),
            "tokens_processed": int(metrics["tokens_processed"] or 0),
            "active_conversations": int(conversations["active_conversations"] or 0),
            "paused_conversations": int(conversations["paused_conversations"] or 0),
            "cancelled_conversations": int(conversations["cancelled_conversations"] or 0),
            "completed_conversations": int(conversations["completed_conversations"] or 0),
            "status_breakdown": [dict(r) for r in status_rows],
            "provider_breakdown": [dict(r) for r in provider_rows],
            "recent_errors": [dict(r) for r in recent_errors],
        }


@router.post("/ingest/logs", dependencies=[Depends(require_ingest_access)])
async def ingest_log(payload: IngestLog):
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO inference_logs (provider, model, conversation_id, message_id, status, redacted_input_preview, redacted_output_preview) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            payload.provider,
            payload.model,
            payload.conversation_id,
            payload.message_id,
            payload.status,
            payload.redacted_input_preview,
            payload.redacted_output_preview,
        )
        try:
            from .redis_client import redis
            if redis:
                await redis.lpush('inference_queue', str(row['id']))
        except Exception:
            pass
        return dict(row)
