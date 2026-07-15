"""
CLINNA AI — Account deletion
Required by Apple App Store guideline 5.1.1(v): apps that support account
creation must offer in-app account deletion. Deleting the auth.users row
cascades to public.profiles and public.scans (ON DELETE CASCADE / user_id FK).
"""
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_user

log = logging.getLogger("clinna.account")

router = APIRouter()

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")


@router.delete("")
async def delete_account(user_id: str = Depends(require_user)):
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise HTTPException(503, "SUPABASE_SERVICE_ROLE_KEY not configured.")

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
        )
    if resp.status_code not in (200, 204):
        log.error("Account deletion failed for %s: %s %s", user_id, resp.status_code, resp.text)
        raise HTTPException(502, "Account deletion failed. Please try again.")
    return {"ok": True}
