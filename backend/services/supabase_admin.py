"""
CLINNA AI — service-role access to Supabase
One place for the calls the backend makes with SUPABASE_SERVICE_ROLE_KEY:
RPCs (entitlements, webhook bookkeeping) and Storage (account deletion).
The key is read lazily so a missing value only breaks the features that
need it, not app start-up.
"""
import logging
import os

import httpx
from fastapi import HTTPException

log = logging.getLogger("clinna.supabase")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")

SCANS_BUCKET = "scans_images"


class RpcMissing(Exception):
    """The function does not exist yet — its SQL file has not been run."""


def service_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise HTTPException(503, "SUPABASE_SERVICE_ROLE_KEY not configured.")
    return key


def _headers() -> dict:
    key = service_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


async def rpc(fn_name: str, payload: dict):
    """
    Call a Postgres function and return its JSON result.
    Raises RpcMissing when PostgREST does not know the function (PGRST202),
    so callers can keep working in the window between a backend deploy and
    the matching SQL being run. Any other failure is a 502.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}",
            headers=_headers(),
            json=payload,
        )
    if resp.status_code >= 300:
        code = None
        try:
            code = resp.json().get("code")
        except ValueError:
            pass
        if code == "PGRST202":
            raise RpcMissing(fn_name)
        log.error("Supabase RPC %s failed: %s %s", fn_name, resp.status_code, resp.text)
        raise HTTPException(502, f"Supabase RPC {fn_name} failed")
    if not resp.content:
        return None
    return resp.json()


async def delete_user_storage(user_id: str) -> int:
    """
    Remove every archive photo under "<user_id>/" in scans_images.
    Layout is "<user_id>/<scan_id>/photo.<ext>", so this lists the scan
    folders and then their files. Returns the number of files removed.
    """
    headers = _headers()
    base = f"{SUPABASE_URL}/storage/v1/object"

    async with httpx.AsyncClient(timeout=20.0) as client:

        async def list_dir(prefix: str) -> list[dict]:
            items: list[dict] = []
            offset = 0
            while True:
                resp = await client.post(
                    f"{base}/list/{SCANS_BUCKET}",
                    headers=headers,
                    json={"prefix": prefix, "limit": 1000, "offset": offset},
                )
                resp.raise_for_status()
                page = resp.json() or []
                items.extend(page)
                if len(page) < 1000:
                    return items
                offset += 1000

        paths: list[str] = []
        for entry in await list_dir(user_id):
            name = entry.get("name")
            if not name:
                continue
            if entry.get("id"):  # a file directly under the user folder
                paths.append(f"{user_id}/{name}")
                continue
            for f in await list_dir(f"{user_id}/{name}"):
                if f.get("id") and f.get("name"):
                    paths.append(f"{user_id}/{name}/{f['name']}")

        for i in range(0, len(paths), 100):
            resp = await client.request(
                "DELETE",
                f"{base}/{SCANS_BUCKET}",
                headers=headers,
                json={"prefixes": paths[i:i + 100]},
            )
            resp.raise_for_status()

    return len(paths)
