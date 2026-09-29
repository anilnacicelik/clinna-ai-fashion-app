"""
CLINNA AI — Account deletion
Required by Apple App Store guideline 5.1.1(v): apps that support account
creation must offer in-app account deletion. Deleting the auth.users row
cascades to public.profiles and public.scans (ON DELETE CASCADE / user_id FK).
Storage has no such cascade, so the user's archive photos are removed first.
"""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_user
from services.supabase_admin import SUPABASE_URL, delete_user_storage, service_key as get_service_key

log = logging.getLogger("clinna.account")

router = APIRouter()


@router.delete("")
async def delete_account(user_id: str = Depends(require_user)):
    service_key = get_service_key()

    # Photos first: once the auth user is gone nothing ties the folder to
    # anyone. A storage failure is logged, not fatal — the user asked for the
    # account to go, and the private bucket keeps any leftovers unreadable.
    try:
        removed = await delete_user_storage(user_id)
        log.info("Deleted %d archive photo(s) for %s", removed, user_id)
    except Exception as e:
        log.error("Archive photo cleanup failed for %s: %s", user_id, e)

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
