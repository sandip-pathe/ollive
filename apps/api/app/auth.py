from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from . import db

router = APIRouter(prefix="/api/auth")

AUTH_INVITE_CODE = os.getenv("AUTH_INVITE_CODE")
AUTH_SESSION_SECRET = os.getenv("AUTH_SESSION_SECRET")
SESSION_TTL_SECONDS = int(os.getenv("AUTH_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 30)))
_CURRENT_USER: ContextVar[AuthUser | None] = ContextVar("ollive_current_user", default=None)


class LoginRequest(BaseModel):
    invite_code: str = Field(min_length=1)
    display_name: str | None = Field(default=None, max_length=80)


class AuthUser(BaseModel):
    id: UUID
    display_name: str | None = None
    created_at: datetime | None = None


class SessionResponse(BaseModel):
    user: AuthUser
    token: str


def _get_pool():
    if db.pool is None:
        raise HTTPException(status_code=503, detail="Database is still starting up")
    return db.pool


def _require_auth_config() -> None:
    if not AUTH_INVITE_CODE or not AUTH_SESSION_SECRET:
        raise HTTPException(status_code=500, detail="Auth is not configured")


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _sign(payload_b64: str) -> str:
    secret = AUTH_SESSION_SECRET.encode("utf-8")
    return _base64url_encode(hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest())


def _issue_session_token(user_id: UUID) -> str:
    payload = {
        "user_id": str(user_id),
        "iat": int(time.time()),
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def _verify_session_token(token: str) -> UUID:
    _require_auth_config()
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc

    expected = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid session token")

    try:
        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        user_id = UUID(payload["user_id"])
        expires_at = int(payload["exp"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc

    if expires_at < int(time.time()):
        raise HTTPException(status_code=401, detail="Session expired")
    return user_id


def _set_current_user(user: AuthUser | None) -> None:
    _CURRENT_USER.set(user)


def get_current_user() -> AuthUser:
    user = _CURRENT_USER.get()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def _load_user_by_id(user_id: UUID) -> AuthUser | None:
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, display_name, created_at FROM users WHERE id=$1",
            user_id,
        )
    if not row:
        return None
    return AuthUser(**dict(row))


async def require_current_user(request: Request) -> AuthUser:
    auth_header = request.headers.get("authorization", "")
    token = ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.query_params.get("token", "").strip()
    if not token:
        token = request.query_params.get("access_token", "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = _verify_session_token(token)
    user = await _load_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    _set_current_user(user)
    return user


@router.post("/login", response_model=SessionResponse)
async def login(payload: LoginRequest):
    _require_auth_config()
    if payload.invite_code != AUTH_INVITE_CODE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid invite code")

    display_name = (payload.display_name or "Guest").strip() or "Guest"
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (display_name) VALUES ($1) RETURNING id, display_name, created_at",
            display_name,
        )
    user = AuthUser(**dict(row))
    token = _issue_session_token(user.id)
    return SessionResponse(user=user, token=token)


@router.get("/me", response_model=AuthUser)
async def me(user: Annotated[AuthUser, Depends(require_current_user)]):
    return user
