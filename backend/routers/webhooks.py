"""
CLINNA AI — RevenueCat webhook
Authoritative source of truth for entitlements. The client never writes
credits/is_pro directly to Supabase (see security_hardening_migration.sql) —
only this server-side handler can, using the Supabase service role key.

Configure in the RevenueCat dashboard:
  Project settings → Integrations → Webhooks
  URL:            https://<railway-domain>/api/v1/webhooks/revenuecat
  Auth header:    same value as REVENUECAT_WEBHOOK_SECRET env var

Idempotency: RevenueCat retries an event it did not get a 2xx for. Each
event id is claimed in public.webhook_events before it is applied (see
supabase/webhook_events.sql); a repeat is acknowledged and skipped. If
applying fails the claim is released, so the retry can apply it.
"""
import hmac
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request

from services.supabase_admin import RpcMissing, rpc

log = logging.getLogger("clinna.webhooks")

router = APIRouter()


def _webhook_secret() -> str:
    # Read lazily (not at import time) so a missing secret only breaks this
    # endpoint, not the whole app.
    secret = os.getenv("REVENUECAT_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "REVENUECAT_WEBHOOK_SECRET not configured.")
    return secret

# Mirrors CREDIT_PRODUCTS in mobile/src/screens/PaywallScreen.tsx — keep the
# product IDs in sync with that catalogue and with App Store Connect.
# The pro SKUs (clinna_pro_monthly / clinna_pro_annual) are deliberately absent:
# the pro branch below matches by exclusion, so renaming a subscription in App
# Store Connect does not require a backend change.
CREDIT_AMOUNTS = {
    "clinna_credit_1":  1,
    "clinna_credit_5":  5,
    "clinna_credit_15": 15,
}

PRO_PURCHASE_TYPES = {"INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"}
CREDIT_PURCHASE_TYPES = {"NON_RENEWING_PURCHASE", "INITIAL_PURCHASE"}
EXPIRE_TYPES = {"EXPIRATION"}

# RevenueCat reports a refund as CANCELLATION with this cancel_reason. For a
# subscription, any other reason (UNSUBSCRIBE, BILLING_ERROR, …) only means
# auto-renew is off: the user has paid through the period, and access ends
# with the EXPIRATION event, not here. For a one-time credit pack there is
# nothing to unsubscribe from — a CANCELLATION on one is always a refund.
REFUND_CANCEL_REASON = "CUSTOMER_SUPPORT"


async def _apply(event_type: str, app_user_id: str, product_id: str | None, event: dict) -> dict:
    # Consumable credit packs
    if event_type in CREDIT_PURCHASE_TYPES and product_id in CREDIT_AMOUNTS:
        await rpc("internal_add_credits", {
            "p_user_id": app_user_id,
            "p_amount":  CREDIT_AMOUNTS[product_id],
        })
        return {"ok": True, "action": "credits_added", "amount": CREDIT_AMOUNTS[product_id]}

    # Refunds
    if event_type == "CANCELLATION":
        if product_id in CREDIT_AMOUNTS:
            try:
                await rpc("internal_remove_credits", {
                    "p_user_id": app_user_id,
                    "p_amount":  CREDIT_AMOUNTS[product_id],
                })
            except RpcMissing:
                log.warning("Credit refund for %s not applied — internal_remove_credits missing", app_user_id)
                return {"ok": True, "action": "skipped_refund_unsupported"}
            return {"ok": True, "action": "credits_refunded", "amount": CREDIT_AMOUNTS[product_id]}

        if event.get("cancel_reason") == REFUND_CANCEL_REASON:
            await rpc("internal_expire_pro", {"p_user_id": app_user_id})
            return {"ok": True, "action": "pro_refunded"}

        # Auto-renew switched off — Pro stays until EXPIRATION.
        return {"ok": True, "action": "ignored_cancellation", "cancel_reason": event.get("cancel_reason")}

    # Pro subscription grant/renewal
    if event_type in PRO_PURCHASE_TYPES and product_id not in CREDIT_AMOUNTS:
        expiration_ms = event.get("expiration_at_ms")
        if expiration_ms:
            expires_at = datetime.fromtimestamp(expiration_ms / 1000, tz=timezone.utc).isoformat()
            await rpc("internal_set_pro", {
                "p_user_id":   app_user_id,
                "p_expires_at": expires_at,
            })
            return {"ok": True, "action": "pro_granted", "expires_at": expires_at}
        log.warning("Pro purchase event without expiration_at_ms — skipping: %s", event)
        return {"ok": True, "action": "skipped_no_expiration"}

    # Subscription lapsed
    if event_type in EXPIRE_TYPES:
        await rpc("internal_expire_pro", {"p_user_id": app_user_id})
        return {"ok": True, "action": "pro_expired"}

    return {"ok": True, "action": "ignored", "event_type": event_type}


@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
):
    if not authorization or not hmac.compare_digest(authorization, _webhook_secret()):
        raise HTTPException(401, "Invalid webhook signature.")

    body  = await request.json()
    event = body.get("event", {})

    event_id     = event.get("id")
    event_type   = event.get("type")
    app_user_id  = event.get("app_user_id")
    product_id   = event.get("product_id")

    if not app_user_id or not event_type:
        raise HTTPException(400, "Malformed webhook payload.")

    log.info("RevenueCat event=%s id=%s user=%s product=%s", event_type, event_id, app_user_id, product_id)

    # ── Idempotency ──────────────────────────────────────────────
    claimed = False
    if event_id:
        try:
            first_time = await rpc("internal_claim_webhook_event", {
                "p_event_id":    event_id,
                "p_event_type":  event_type,
                "p_app_user_id": app_user_id,
                "p_product_id":  product_id,
            })
        except RpcMissing:
            log.warning("webhook_events not installed — processing %s without duplicate protection", event_id)
        else:
            if first_time is False:
                log.info("RevenueCat event %s already processed — skipping", event_id)
                return {"ok": True, "action": "duplicate", "event_id": event_id}
            claimed = True
    else:
        log.warning("RevenueCat event without id — cannot deduplicate: %s", event_type)

    try:
        return await _apply(event_type, app_user_id, product_id, event)
    except Exception:
        # Let RevenueCat's retry apply it: un-claim, then fail the request.
        if claimed:
            try:
                await rpc("internal_release_webhook_event", {"p_event_id": event_id})
            except Exception as e:
                log.error("Could not release webhook event %s: %s", event_id, e)
        raise
