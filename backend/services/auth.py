"""
CLINNA AI — Auth dependency
Verifies the Supabase access token on protected endpoints by asking
Supabase's Auth server to resolve it to a user. Prevents unauthenticated
callers from hitting the (costly) Gemini-backed analyze endpoints directly.
"""
import os
import logging

import httpx
from fastapi import Header, HTTPException

log = logging.getLogger("clinna.auth")

SUPABASE_URL      = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]


async def require_user(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency — returns the authenticated user's id, or raises 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header.")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Missing bearer token.")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_ANON_KEY,
                },
            )
    except httpx.HTTPError as e:
        log.error("Supabase auth check failed: %s", e)
        raise HTTPException(503, "Auth verification temporarily unavailable.") from e

    if resp.status_code != 200:
        raise HTTPException(401, "Invalid or expired session.")

    user = resp.json()
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(401, "Invalid session payload.")
    return user_id
