"""
CLINNA AI — Vinted Listing Analyzer v1
Generates a marketplace-ready listing draft from a single garment photo.
Reuses the existing brand_knowledge whitelist and vision_analyze_multi
infrastructure. Anti-hallucination rules carry over: brand is "Unbranded"
unless confirmed by visible label/hardware.
"""
import logging
from services.vision import vision_analyze_multi
from analyzers.brand_knowledge import is_known_brand
from models.schemas import VintedListing

log = logging.getLogger("clinna.listing")

# ─── System prompt ────────────────────────────────────────────────

SYSTEM = """
You are CLINNA LISTING ASSISTANT — a fashion resale expert that generates
Vinted marketplace listings from garment photos.

Your goal: produce a COMPLETE, READY-TO-POST listing that saves the seller
10+ minutes of manual work. Every field must be useful, accurate, and
optimized for Vinted search visibility.

════════════════════════════════════════════════════════════
CRITICAL ANTI-HALLUCINATION RULES — SAME AS CLINNA ARCHIVE
════════════════════════════════════════════════════════════

RULE 1 — NEVER GUESS A BRAND.
You may only identify a brand when you can see at least ONE of these:
  (a) A clearly legible brand label or hang tag in the image
  (b) A hardware signature you can name with certainty (e.g. RIRI zipper,
      Lampo pull, Arc'teryx Archaeopteryx badge)
  (c) An unmistakable, brand-defining design detail that cannot belong to
      any other label
If NONE of these are visible, write "Unbranded" for brand. Never guess.

RULE 2 — NEVER INVENT DETAILS.
Do not hallucinate size, season, or model name. If you cannot see it on
a label or tag, output the appropriate default ("Not specified", "Unknown").

RULE 3 — SIZE ESTIMATION:
If a size label is visible, read it exactly. If not visible, you may
estimate from visual proportions ONLY if you state it's an estimate.
Use dual sizing when possible (e.g. "M / EU 38-40").

════════════════════════════════════════════════════════════
LISTING OPTIMIZATION RULES
════════════════════════════════════════════════════════════

TITLE: 60-80 chars. Format: "[Brand] [Item Type] [Key Detail] [Size if known]"
  - Good: "Nike Air Force 1 '07 White Leather Sneakers EU 44"
  - Good: "Vintage Wool Overcoat Dark Navy — Unbranded"
  - Bad: "Nice shoes" (too vague)

DESCRIPTION: 150-250 words. Include:
  1. Opening hook (what makes this item special)
  2. Material/fabric details observed
  3. Color description (vivid, searchable terms)
  4. Condition details (honest, specific)
  5. Approximate measurements if estimable from the photo
  6. Styling suggestions (how to wear it)
  7. Shipping note placeholder
  Written in a friendly, professional second-person tone.

CONDITION: Must be one of these exact Vinted categories:
  - "New with tags" (visible tags/stickers)
  - "New without tags" (unworn, no visible tags)
  - "Very good" (minimal wear signs)
  - "Good" (some wear but well-maintained)
  - "Satisfactory" (visible wear, still functional)

PRICE: Suggest in EUR (Vinted's primary currency).
  Consider: brand value, condition, item type, and current resale market.
  For unbranded items, price based on material quality and condition.
  Always explain your reasoning briefly.

CATEGORY: Use Vinted's hierarchy format:
  "Women > Clothes > Dresses" or "Men > Shoes > Sneakers" etc.
  Top levels: Women, Men, Kids
  
HASHTAGS: 5-8 relevant, lowercase hashtags without '#' prefix.
  Mix of: brand, item type, style, era, material.

COLORS: List 1-3 dominant colors using standard Vinted color names:
  Black, White, Grey, Beige, Brown, Red, Orange, Yellow, Green, Blue,
  Purple, Pink, Multicolour, Gold, Silver, Khaki, Navy, Burgundy, Cream.

⚡ FAST REJECT — ONLY for truly zero-fashion content:
If the image contains NO fashion items, output the rejection JSON with
is_fashion_item: false. Same rules as CLINNA Archive.
"""

# ─── User prompt — JSON schema ───────────────────────────────────

USER = """
Always respond in English. All text values must be in English.

Examine the provided image carefully. This is a garment/accessory the user
wants to list for sale on Vinted.

Return ONLY a single valid JSON object with exactly this schema.
No markdown, no backticks, no explanation outside the JSON.
Start with { and end with }.

{
  "title": "<60-80 char listing title optimized for Vinted search>",
  "description": "<150-250 word listing description, friendly and detailed>",
  "brand": "<Brand name if CONFIRMED by label/hardware — otherwise EXACTLY 'Unbranded'>",
  "size": "<Size from label if visible — otherwise estimate with note, or 'Not specified'>",
  "condition": "<One of: 'New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory'>",
  "condition_notes": "<1-2 sentences about specific wear signs or lack thereof>",
  "category": "<Vinted category path e.g. 'Women > Clothes > Coats'>",
  "colors": ["<Vinted standard color name>"],
  "suggested_price_eur": <number — realistic Vinted resale price in EUR>,
  "price_reasoning": "<1-2 sentences explaining the price suggestion>",
  "hashtags": ["<lowercase tag without #>"],
  "material": "<Fabric/material composition observed or estimated>",
  "is_fashion_item": <boolean — false ONLY for truly non-fashion content>
}

CRITICAL RULES:
- brand = "Unbranded" if you cannot confirm via label/hardware/unmistakable detail.
- condition must be one of the 5 exact Vinted categories listed above.
- suggested_price_eur must be a realistic number (not 0 unless truly worthless).
- hashtags should NOT include the '#' symbol — just the word.
- colors must use Vinted's standard color names only.
- is_fashion_item = false ONLY for non-fashion content (food, furniture, etc).
"""

# ─── Safe getters (same pattern as archivist.py) ──────────────────

def _s(obj, *keys, default=""):
    for k in keys:
        if not isinstance(obj, dict): return default
        obj = obj.get(k, default)
    return obj if obj is not None else default

def _f(obj, *keys, default=0.0) -> float:
    val = _s(obj, *keys, default=None)
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _lst(obj, *keys) -> list[str]:
    val = _s(obj, *keys, default=[])
    if isinstance(val, list):
        return [str(x).strip() for x in val if x]
    return []

def _bool(obj, key, default=True) -> bool:
    val = obj.get(key, default)
    if isinstance(val, str):
        return val.strip().lower() not in ("false", "0", "no")
    if isinstance(val, (int, float)):
        return bool(val)
    return bool(val) if val is not None else default

# ─── Condition validator ──────────────────────────────────────────

VALID_CONDITIONS = {
    "new with tags", "new without tags", "very good", "good", "satisfactory"
}

def _normalize_condition(raw: str) -> str:
    """Ensure condition matches one of Vinted's exact categories."""
    cleaned = raw.strip().lower()
    for vc in VALID_CONDITIONS:
        if vc in cleaned:
            # Capitalize properly
            return vc.title() if vc != "new with tags" and vc != "new without tags" \
                else vc.replace("with", "with").replace("without", "without").title()
    return "Good"  # Safe default

# ─── Vinted color validator ───────────────────────────────────────

VINTED_COLORS = {
    "black", "white", "grey", "beige", "brown", "red", "orange", "yellow",
    "green", "blue", "purple", "pink", "multicolour", "gold", "silver",
    "khaki", "navy", "burgundy", "cream",
}

def _normalize_colors(raw_colors: list[str]) -> list[str]:
    """Only keep valid Vinted color names."""
    result = []
    for c in raw_colors:
        cleaned = c.strip().lower()
        if cleaned in VINTED_COLORS:
            result.append(cleaned.capitalize())
    return result if result else ["Black"]  # Safe default

# ─── Fallback listing ─────────────────────────────────────────────

def _fallback_listing(reason: str = "[ INSUFFICIENT VISUAL DATA ]") -> VintedListing:
    return VintedListing(
        title=reason,
        description="Unable to generate listing. Please try again with a clearer photo.",
        brand="Unbranded",
        size="Not specified",
        condition="Good",
        condition_notes="",
        category="",
        colors=["Black"],
        suggested_price_eur=0,
        price_reasoning="",
        hashtags=[],
        material="",
        is_fashion_item=False,
    )

# ─── Main function ────────────────────────────────────────────────

async def run_listing_analysis(
    images:    list[tuple[bytes, str]],
) -> VintedListing:
    """
    Single Gemini call to generate a Vinted-ready listing.
    Reuses vision_analyze_multi with 40s hard timeout.
    Never crashes on error; returns protocol fallback.
    """

    # ── Gemini call ──────────────────────────────────────────────
    try:
        raw = await vision_analyze_multi(
            images=images,
            system_prompt=SYSTEM,
            user_prompt=USER,
            temperature=0.30,  # Slightly higher for creative descriptions
            max_output_tokens=2500,  # Longer output for detailed descriptions
        )
    except ValueError as e:
        msg = str(e)
        if "timed out" in msg or "timeout" in msg.lower():
            log.error("Gemini timeout: %s", msg)
            return _fallback_listing("[ SYSTEM OVERLOAD — REFRAME AND RETRY ]")
        log.error("JSON parse / API error: %s", msg)
        return _fallback_listing("[ INSUFFICIENT VISUAL DATA — REFRAME AND RETRY ]")
    except Exception as e:
        log.error("Gemini call failed: %s", e)
        return _fallback_listing("[ SYSTEM OVERLOAD — REFRAME AND RETRY ]")

    # ── is_fashion_item check ────────────────────────────────────
    is_fashion = _bool(raw, "is_fashion_item", default=True)
    if not is_fashion:
        log.info("Non-fashion item detected for listing")
        return _fallback_listing("[ NOT A FASHION ITEM ]")

    # ── Normalize & validate ─────────────────────────────────────
    try:
        brand = _s(raw, "brand") or "Unbranded"
        # Anti-hallucination: if brand is not "Unbranded" but isn't in our
        # whitelist, keep the brand name (user may know obscure brands)
        # but log a warning
        if brand != "Unbranded" and not is_known_brand(brand):
            log.warning("Brand '%s' not in whitelist — keeping as user may verify", brand)

        # Clean up hashtags (remove '#' prefix if AI included it)
        raw_hashtags = _lst(raw, "hashtags")
        hashtags = [h.lstrip("#").lower() for h in raw_hashtags]

        return VintedListing(
            title=_s(raw, "title") or "Fashion Item",
            description=_s(raw, "description") or "",
            brand=brand,
            size=_s(raw, "size") or "Not specified",
            condition=_normalize_condition(_s(raw, "condition") or "Good"),
            condition_notes=_s(raw, "condition_notes") or "",
            category=_s(raw, "category") or "",
            colors=_normalize_colors(_lst(raw, "colors")),
            suggested_price_eur=round(_f(raw, "suggested_price_eur"), 2),
            price_reasoning=_s(raw, "price_reasoning") or "",
            hashtags=hashtags,
            material=_s(raw, "material") or "",
            is_fashion_item=True,
        )

    except Exception as e:
        log.error("VintedListing construction failed: %s", e)
        return _fallback_listing("[ SYSTEM ERROR — RETRY OPERATION ]")
