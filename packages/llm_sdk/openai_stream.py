from __future__ import annotations

import inspect
import json
import os
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List

import httpx

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
TraceEmitter = Callable[[str, Dict[str, Any]], Awaitable[None] | None]


async def _emit(emit_event: TraceEmitter | None, event_type: str, payload: Dict[str, Any]) -> None:
    if emit_event is None:
        return
    result = emit_event(event_type, payload)
    if inspect.isawaitable(result):
        await result


async def stream_chat(
    messages: List[Dict],
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    trace_id: str | None = None,
    emit_event: TraceEmitter | None = None,
) -> AsyncIterator[str]:
    """Stream text chunks from OpenAI Chat Completions API (server streaming).
    Yields partial text chunks as they arrive.
    """
    if not OPENAI_KEY:
        stub = "This is a stubbed streaming response. Set OPENAI_API_KEY to stream real responses."
        await _emit(
            emit_event,
            "first_token",
            {"trace_id": trace_id, "stubbed": True, "chunk_length": len(stub)},
        )
        await _emit(
            emit_event,
            "stream_completed",
            {"trace_id": trace_id, "stubbed": True, "chunks_count": 1},
        )
        yield stub
        return

    headers = {
        "Authorization": f"Bearer {OPENAI_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    first_token_seen = False

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OPENAI_URL, headers=headers, json=payload) as resp:
            async for line in resp.aiter_lines():
                if not line:
                    continue
                line = line.strip()
                if line.startswith("data:"):
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        await _emit(
                            emit_event,
                            "stream_completed",
                            {"trace_id": trace_id, "provider": "openai", "model": model},
                        )
                        return
                    try:
                        obj = json.loads(data)
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        chunk = delta.get("content")
                        if chunk:
                            if not first_token_seen:
                                first_token_seen = True
                                await _emit(
                                    emit_event,
                                    "first_token",
                                    {"trace_id": trace_id, "provider": "openai", "model": model, "chunk_length": len(chunk)},
                                )
                            await _emit(
                                emit_event,
                                "chunk",
                                {"trace_id": trace_id, "provider": "openai", "model": model, "chunk_length": len(chunk)},
                            )
                            yield chunk
                    except Exception as exc:
                        await _emit(
                            emit_event,
                            "warning",
                            {"trace_id": trace_id, "provider": "openai", "model": model, "message": str(exc)},
                        )
                        continue
