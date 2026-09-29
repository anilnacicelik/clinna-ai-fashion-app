"""
CLINNA AI — scan entitlement, enforced server-side
Every paid analysis endpoint consumes one scan BEFORE Gemini is called and
refunds it if the analysis produced nothing (Gemini error, timeout, not a
fashion item). The client no longer deducts anything.

Deploy-order safety: until supabase/consume_scan_credit.sql has been run the
RPC does not exist, and this module falls back to the old behaviour — allow
the scan, deduct nothing, return no entitlement — so the store build (which
still deducts client-side) keeps working. That SQL also neuters the old
client-side RPCs in the same transaction, so there is no double charge.
"""
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, TypeVar

from fastapi import HTTPException

from models.schemas import ScanEntitlement
from services.supabase_admin import RpcMissing, rpc

log = logging.getLogger("clinna.entitlement")

T = TypeVar("T")

NO_CREDITS_DETAIL = "NO SCANS LEFT — GET CREDITS TO CONTINUE."


@dataclass
class Consumed:
    source:      Optional[str]               # 'pro' | 'free' | 'credit' | None (legacy mode)
    entitlement: Optional[ScanEntitlement]


def _to_entitlement(data: dict) -> ScanEntitlement:
    return ScanEntitlement(
        scans_left=max(0, int(data.get("scans_left") or 0)),
        credits=max(0, int(data.get("credits") or 0)),
        is_pro_active=bool(data.get("is_pro_active")),
    )


async def consume_scan(user_id: str) -> Consumed:
    """Take one scan from the user, or raise 402 when they have none."""
    try:
        data = await rpc("consume_scan_credit", {"p_user_id": user_id})
    except RpcMissing:
        log.warning("consume_scan_credit not installed — legacy mode (no server-side deduction)")
        return Consumed(source=None, entitlement=None)

    if not isinstance(data, dict):
        log.error("consume_scan_credit returned unexpected payload: %r", data)
        raise HTTPException(502, "Entitlement check failed.")

    if not data.get("ok"):
        raise HTTPException(402, NO_CREDITS_DETAIL)

    return Consumed(source=data.get("source"), entitlement=_to_entitlement(data))


async def refund_scan(user_id: str, consumed: Consumed) -> Optional[ScanEntitlement]:
    """Give back what consume_scan took. Never raises — logs instead."""
    if consumed.source in (None, "pro"):
        return consumed.entitlement
    try:
        data = await rpc("refund_scan_credit", {"p_user_id": user_id, "p_source": consumed.source})
        return _to_entitlement(data) if isinstance(data, dict) else consumed.entitlement
    except Exception as e:
        log.error("Refund failed for %s (source=%s): %s", user_id, consumed.source, e)
        return consumed.entitlement


async def run_paid_scan(user_id: str, analyze: Callable[[], Awaitable[T]]) -> T:
    """
    consume → analyze → (refund if nothing came of it) → attach the
    up-to-date entitlement to the result. `analyze` returns an ArchiveReport
    or VintedListing; both report failure as is_fashion_item = False (the
    analyzers never raise — they return a fallback instead).
    """
    consumed = await consume_scan(user_id)
    try:
        result = await analyze()
    except Exception:
        await refund_scan(user_id, consumed)
        raise

    entitlement = consumed.entitlement
    if not getattr(result, "is_fashion_item", True):
        entitlement = await refund_scan(user_id, consumed)

    result.entitlement = entitlement
    return result
