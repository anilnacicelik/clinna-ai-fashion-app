"""
CLINNA AI — RevenueCat webhook
Authoritative source of truth for entitlements. The client never writes
credits/is_pro directly to Supabase (see security_hardening_migration.sql) —
only this server-side handler can, using the Supabase service role key.

Configure in the RevenueCat dashboard:
  Project settings → Integrations → Webhooks
  URL:            https://<railway-domain>/api/v1/webhooks/revenuecat
  Auth header:    same value as REVENUECAT_WEBHOOK_SECRET env var
"""
import hmac
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Header, HTTPException, Request

log = logging.getLogger("clinna.webhooks")

router = APIRouter()

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")

# Read lazily (not at import time) so a missing service-role key / webhook
# secret only breaks this endpoint, not the whole app (e.g. /analyze must
# keep working even before RevenueCat webhook config is finished).


def _service_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise HTTPException(503, "SUPABASE_SERVICE_ROLE_KEY not configured.")
    return key


def _webhook_secret() -> str:
    secret = os.getenv("REVENUECAT_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "REVENUECAT_WEBHOOK_SECRET not configured.")
    return secret

# Mirrors mobile/src/services/purchases.ts CREDIT_AMOUNTS — keep in sync.
CREDIT_AMOUNTS = {
    "clinna_credit_1":  1,
    "clinna_credit_5":  5,
    "clinna_credit_15": 15,
}

PRO_PURCHASE_TYPES = {"INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"}
CREDIT_PURCHASE_TYPES = {"NON_RENEWING_PURCHASE", "INITIAL_PURCHASE"}
EXPIRE_TYPES = {"EXPIRATION"}


async def _call_rpc(fn_name: str, payload: dict) -> None:
    service_key = _service_key()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if resp.status_code >= 300:
        log.error("Supabase RPC %s failed: %s %s", fn_name, resp.status_code, resp.text)
        raise HTTPException(502, f"Supabase RPC {fn_name} failed")


@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
):
    if not authorization or not hmac.compare_digest(authorization, _webhook_secret()):
        raise HTTPException(401, "Invalid webhook signature.")

    body  = await request.json()
    event = body.get("event", {})

    event_type   = event.get("type")
    app_user_id  = event.get("app_user_id")
    product_id   = event.get("product_id")
    expiration_ms = event.get("expiration_at_ms")

    if not app_user_id or not event_type:
        raise HTTPException(400, "Malformed webhook payload.")

    log.info("RevenueCat event=%s user=%s product=%s", event_type, app_user_id, product_id)

    # Consumable credit packs
    if event_type in CREDIT_PURCHASE_TYPES and product_id in CREDIT_AMOUNTS:
        await _call_rpc("internal_add_credits", {
            "p_user_id": app_user_id,
            "p_amount":  CREDIT_AMOUNTS[product_id],
        })
        return {"ok": True, "action": "credits_added", "amount": CREDIT_AMOUNTS[product_id]}

    # Pro subscription grant/renewal
    if event_type in PRO_PURCHASE_TYPES and product_id not in CREDIT_AMOUNTS:
        if expiration_ms:
            expires_at = datetime.fromtimestamp(expiration_ms / 1000, tz=timezone.utc).isoformat()
        else:
            expires_at = None
        if expires_at:
            await _call_rpc("internal_set_pro", {
                "p_user_id":   app_user_id,
                "p_expires_at": expires_at,
            })
            return {"ok": True, "action": "pro_granted", "expires_at": expires_at}
        log.warning("Pro purchase event without expiration_at_ms — skipping: %s", event)
        return {"ok": True, "action": "skipped_no_expiration"}

    # Subscription lapsed
    if event_type in EXPIRE_TYPES:
        await _call_rpc("internal_expire_pro", {"p_user_id": app_user_id})
        return {"ok": True, "action": "pro_expired"}

    return {"ok": True, "action": "ignored", "event_type": event_type}
