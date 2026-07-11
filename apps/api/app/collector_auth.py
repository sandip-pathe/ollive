from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request, status


INGEST_TOKEN = os.getenv("OLLIVE_INGEST_TOKEN")


async def require_ingest_access(request: Request) -> None:
    if not INGEST_TOKEN:
        return

    token = request.headers.get("x-ollive-token", "").strip()
    auth_header = request.headers.get("authorization", "").strip()
    if not token and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    if not token or not hmac.compare_digest(token, INGEST_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "problem": "Invalid Ollive ingest token",
                "cause": "OLLIVE_INGEST_TOKEN is configured, but the request did not provide a matching X-Ollive-Token or Bearer token.",
                "fix": "Send X-Ollive-Token with the configured token, or unset OLLIVE_INGEST_TOKEN for local-only development.",
            },
        )
