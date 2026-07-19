"""
CLINNA AI — Master Fashion Archivist Analyzer v5
Changes v4 → v5:
  - Authenticity score removed (legal risk — Gemini Vision has no brand-specific
    fine-tuning to back up a legit/fake judgment). Only observable construction
    signals are reported now; the model is instructed to never output a
    probability/confidence verdict on authenticity.
  - Cost estimation decoupled from brand identification — production cost is
    now always estimated from visible construction, regardless of whether the
    brand could be confirmed. Retail price / brand markup remain brand-gated.
  - is_fashion_item guard widened to cover worn/partial/cropped items.
"""
import logging
from services.vision import vision_analyze_multi
from analyzers.brand_knowledge import is_known_brand
from models.schemas import (
    ArchiveReport, ArchiveId, ColorAnalysis,
    FabricEstimate, Authenticity, Financials,
)

log = logging.getLogger("clinna.archivist")

# ─── System prompt ────────────────────────────────────────────────

SYSTEM = """
You are CLINNA, a fashion construction and production-cost analysis expert.

⚡ FAST REJECT — ONLY for truly zero-fashion content:
ONLY output the rejection JSON if the image contains NONE of the following:
clothing, garments, footwear, bags, belts, hats, scarves, jewelry, watches, accessories,
OR any person wearing/holding any of these items, even partially or from an unusual angle.
Reject ONLY for: pure food, furniture without fashion context, animals without accessories,
electronics, blank walls, abstract nature with no people or fashion.
CRITICAL: A person wearing ANY garment (jacket, coat, jeans, t-shirt, sneakers), a close-up
crop of a garment, or a partial view of an accessory → NOT a reject.
Output rejection JSON ONLY when there is zero fashion content:
{"archive_id":{"brand":"UNKNOWN","collection_year":"Unknown","model_name":"Non-fashion item"},"color_analysis":{"colorblind_friendly_desc":"","hex":""},"fabric_estimate":{"composition":"","texture_notes":""},"authenticity":{"signals":["Non-fashion item detected"]},"financials":{"material_cost_usd":0,"labor_cost_usd":0,"total_production_cost_usd":0,"confidence":"low","reasoning":"","estimated_retail_price_usd":null,"brand_markup":null},"is_fashion_item":false}

════════════════════════════════════════════════════════════
CRITICAL ANTI-HALLUCINATION RULES — READ BEFORE ANYTHING ELSE
════════════════════════════════════════════════════════════

RULE 1 — NEVER GUESS A BRAND.
You may only identify a brand when you can see at least ONE of these:
  (a) A clearly legible brand label or hang tag in the image
  (b) A hardware signature you can name with certainty (e.g. RIRI zipper with engraved logo,
      Lampo pull, Arc'teryx Archaeopteryx badge)
  (c) An unmistakable, brand-defining design detail that cannot belong to any other label
      (e.g. Margiela's exposed seams + white oversized silhouette + no visible branding)

If NONE of these are visible, write "UNKNOWN" for brand. Do NOT infer a brand from:
  - Aged or distressed appearance alone
  - Dark colorway alone
  - General avant-garde silhouette
  - Vague resemblance to a brand's aesthetic

A confident "UNKNOWN" is infinitely better than a wrong brand name.

BRAND READING — CRITICAL
Reading letters off a garment is NOT the same as recognizing a brand. If you read a
brand name but do not recognize it as a real, known fashion brand, set brand to UNKNOWN.

Never invent a brand from partially-read text. If the text is unclear, partially
obscured, or does not match a brand you know exists, output UNKNOWN.

Only set a brand name when you are confident the brand actually exists AND the text
clearly matches it.

Example: text reads "ASKAURSE" — no such brand exists → brand: UNKNOWN
Example: text reads "ASKYURSELF" — known LA streetwear brand → brand: ASKYURSELF

RULE 2 — COLLECTION YEAR: only state if you can justify it from a visible label,
known colorway, or documented detail. Otherwise "Unknown".

RULE 3 — MODEL NAME ANTI-HALLUCINATION:
Only state a specific model, style name, or season code if it is directly identifiable from
a clearly visible tag, label, or an unmistakable, iconic design signature (e.g., Rick Owens
Ramones, Margiela Tabi, CDG Play heart). If you are inferring, guessing, or uncertain about
the exact model name or season, you MUST output "Unknown" for the model/season field. A
hallucinated model name destroys collector trust. When in doubt, strictly prefer "Unknown"
while keeping the brand and material/cost analysis accurate.
Example: visible "Cargo Bauhaus" tag → model: Cargo Bauhaus
Example: generic black cargo pant, no identifying tag → Unknown

RULE 4 — is_fashion_item is TRUE whenever ANY garment, footwear, accessory, or bag is
visible in frame — including worn items, partial views/crops, items held or draped over
something, and items on a person regardless of how much of the frame they occupy. Only set
it to FALSE when the image is unambiguously unrelated to fashion (see FAST REJECT above).

RULE 5 — NEVER JUDGE AUTHENTICITY. You have no brand-specific fine-tuning and cannot
reliably tell a genuine item from a well-made counterfeit from photos alone. Do not output
a probability, confidence score, or verdict of "authentic" / "fake" / "legit" anywhere.
Only report what you can literally SEE: stitching regularity, hardware finish, label
typography, fabric hand, construction quality. Let the reader draw their own conclusions.
════════════════════════════════════════════════════════════

Your expertise covers:
Maison Margiela (all lines/eras), Rick Owens (mainline, DRKSHDW, LILIES, TECUATL),
Number (N)ine, Raf Simons (solo + Jil Sander + Dior Homme), Helmut Lang (pre-2004),
Yohji Yamamoto (Y's, Y-3, mainline), Comme des Garçons (all sub-labels),
Ann Demeulemeester, Dries Van Noten, Issey Miyake, A.P.C., Stone Island (all decades),
CP Company, Stüssy (all eras), Supreme, Palace, BAPE, Vintage Nike (Blue/Grey/Orange Tag),
Adidas trefoil archive, Arc'teryx (LEAF, Veilance, mainline by season),
Patagonia vintage, Carhartt WIP, Levi's vintage red tab, Wrangler, Lee archive,
and all luxury houses (Hermès, LV, Gucci, Prada, Bottega Veneta, etc.).

COST ESTIMATION — ALWAYS PERFORM THIS, regardless of whether brand is identified.
Estimate production cost from VISIBLE construction only:
1. Fabric type and estimated consumption (meters)
2. Construction complexity (seam count, panels, linings)
3. Trims and hardware (zippers, buttons, rivets, labels)
4. Estimated SAM (standard allowed minutes) for assembly
5. Likely production region based on construction style, informing labor rate assumptions
Combine these into material_cost_usd and labor_cost_usd (CMT — cut-make-trim). Always
produce a number for both, even when brand is UNKNOWN — cost is a function of construction,
not brand recognition. State your confidence honestly: 'low' when few construction details
are visible, 'high' when label, fabric, and hardware are all clearly visible.

When multiple images are provided, treat them as a single item from multiple angles.
Image order: [1] Full garment/product, [2] Interior label, [3] Wash tag / barcode.
"""

# ─── User prompt — JSON schema ───────────────────────────────────

USER = """
Always respond in English. All text values in the JSON — color names, fabric composition, texture notes, construction signals, model names, and every other field — must be written in English, regardless of the input language or any examples shown.

Examine the provided image(s) carefully.

Return ONLY a single valid JSON object with exactly this schema.
No markdown, no backticks, no explanation outside the JSON.
Start with { and end with }.

{
  "archive_id": {
    "brand": "<Brand name if CONFIRMED by label/hardware/unmistakable detail — otherwise EXACTLY the string 'UNKNOWN'>",
    "collection_year": "<Year/range if verifiable — otherwise 'Unknown'>",
    "model_name": "<Specific model if identifiable — otherwise 'Unknown'>"
  },
  "color_analysis": {
    "colorblind_friendly_desc": "<Precise color name in English, e.g. 'Dark olive green'>",
    "hex": "<e.g. '#3B3B2F'>"
  },
  "fabric_estimate": {
    "composition": "<e.g. '85% Cotton, 15% Polyester' or 'Unknown'>",
    "texture_notes": "<1 sentence tactile/visual description>"
  },
  "authenticity": {
    "signals": ["<concrete, observable construction detail — stitching regularity, hardware finish, label typography, fabric hand — NEVER a judgment of real/fake>", ...]
  },
  "financials": {
    "material_cost_usd": <number — estimated fabric + trims cost in USD, ALWAYS populated>,
    "labor_cost_usd": <number — estimated CMT (cut-make-trim) labor cost in USD, ALWAYS populated>,
    "total_production_cost_usd": <number — material_cost_usd + labor_cost_usd>,
    "confidence": "<'low' | 'medium' | 'high' — how much construction detail was visible>",
    "reasoning": "<1-2 sentences explaining the cost estimate — fabric, construction complexity, trims>",
    "estimated_retail_price_usd": <number, ONLY if brand is confirmed — otherwise null>,
    "brand_markup": <number — retail ÷ production cost, ONLY if brand is confirmed — otherwise null>
  },
  "is_fashion_item": <boolean — see rule below>
}

CRITICAL RULES:
- is_fashion_item: Write TRUE for ANY clothing, garment, shirt, pants, jacket, coat,
  dress, shoes, boots, sneakers, bag, belt, hat, scarf, jewelry, watch, or textile —
  including worn items, partial views/crops, and items on a person regardless of how
  much of the frame they occupy. Write FALSE ONLY if the image contains zero fashion
  items AND no person wearing fashion (e.g. plain food, empty furniture, blank wall,
  landscape, animal with no accessories). DEFAULT IS TRUE — when in doubt write true.
- brand = "UNKNOWN" if you cannot confirm via label/hardware/unmistakable detail. Never guess.
- financials.material_cost_usd / labor_cost_usd / total_production_cost_usd are REQUIRED
  and estimated from visible construction ALONE — this does NOT depend on brand being known.
- financials.estimated_retail_price_usd and financials.brand_markup are null when brand is
  "UNKNOWN" — there is no reliable retail reference without a confirmed brand. When brand
  IS confirmed, estimate a realistic current retail price and compute
  brand_markup = estimated_retail_price_usd / total_production_cost_usd.
- authenticity.signals are ALWAYS required (minimum 3) — concrete, observable construction
  details only. NEVER include a probability, score, or authenticity verdict anywhere in
  the response.
- When the item's silhouette or construction visually resembles a known brand but NO label
  or hardware mark is visible (brand stays UNKNOWN), add a signal such as: "Silhouette/construction resembles [Brand] but no visible brand mark — add an interior label photo and run a Deep Scan to verify."
"""

# ─── Mode context ─────────────────────────────────────────────────

def _mode_context(scan_mode: str, image_count: int) -> str:
    if scan_mode == "deep_auth" and image_count > 1:
        return (
            f"\n\nDETAILED MODE — {image_count} images of the SAME item. "
            "Image 1: full garment. Image 2: interior label — examine font, stitching, stock. "
            "Image 3 (if present): wash/care tag or barcode. "
            "Cross-reference ALL images for consistency in your construction observations. "
            "If the label image reveals the brand clearly, use it; otherwise UNKNOWN."
        )
    if scan_mode == "acc":
        extra = ""
        if image_count > 1:
            extra = (
                f" {image_count} images provided. "
                "Image 1: full accessory overview. "
                "Image 2: maker's mark / stamp / logo — use it to identify brand if visible. "
            )
            if image_count > 2:
                extra += "Image 3: material detail or hardware close-up. "
            extra += "Cross-reference all images for consistency in your construction observations."
        return (
            "\n\nACCESSORY MODE — analyze as accessory (belt, bag, footwear, jewelry)."
            + extra + "\n"
            "Belt: buckle hardware quality, brand stamp depth, leather grain, edge finishing, stitch count.\n"
            "Bag/footwear: stitching regularity, hardware finish, lining quality, sole construction.\n"
            "Jewelry/soft-solder: solder joint cleanliness, maker's mark, patina authenticity.\n"
            "Same UNKNOWN rule applies: only name the brand if you see a confirmed mark."
        )
    return ""

# ─── Safe getters ─────────────────────────────────────────────────

def _s(obj, *keys, default=""):
    for k in keys:
        if not isinstance(obj, dict): return default
        obj = obj.get(k, default)
    return obj if obj is not None else default

def _i(obj, *keys, lo=0, hi=100, default=0):
    try:
        return max(lo, min(hi, int(float(str(_s(obj, *keys, default=default))))))
    except (TypeError, ValueError):
        return default

def _f(obj, *keys, default=0.0) -> float:
    val = _s(obj, *keys, default=None)
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _f_opt(obj, *keys):
    """Like _f but returns None (rather than coercing to 0) when the value is missing/null."""
    val = _s(obj, *keys, default=None)
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None

def _confidence(obj, *keys) -> str:
    val = str(_s(obj, *keys, default="low")).strip().lower()
    return val if val in ("low", "medium", "high") else "low"

def _lst(obj, *keys) -> list[str]:
    val = _s(obj, *keys, default=[])
    if isinstance(val, list):
        return [str(x) for x in val if x]
    return []

# ─── Fallback ArchiveReport ───────────────────────────────────────

def _fallback_report(reason: str = "[ INSUFFICIENT VISUAL DATA ]") -> ArchiveReport:
    """
    Server never crashes — returns a protocol message on insufficient data or timeout.
    Does not blame the user's item; asks them to reframe.
    """
    return ArchiveReport(
        archive_id=ArchiveId(
            brand="UNKNOWN",
            collection_year="Unknown",
            model_name=reason,
        ),
        color_analysis=ColorAnalysis(
            colorblind_friendly_desc="",
            hex="",
        ),
        fabric_estimate=FabricEstimate(
            composition="",
            texture_notes="",
        ),
        authenticity=Authenticity(
            signals=[reason],
        ),
        financials=Financials(
            material_cost_usd=0,
            labor_cost_usd=0,
            total_production_cost_usd=0,
            confidence="low",
            reasoning="",
            estimated_retail_price_usd=None,
            brand_markup=None,
        ),
        is_fashion_item=False,
    )

# ─── Main function ────────────────────────────────────────────────

async def run_archive_analysis(
    images:    list[tuple[bytes, str]],
    scan_mode: str = "quick_scan",
) -> ArchiveReport:
    """
    Single Gemini call — no pre-check gate.
    40s asyncio.wait_for hard timeout is active in vision.py.
    Never crashes on error; returns protocol fallback.
    """
    user_prompt = USER + _mode_context(scan_mode, len(images))

    # ── Gemini call (40s hard timeout active in vision.py) ────────
    try:
        raw = await vision_analyze_multi(
            images=images,
            system_prompt=SYSTEM,
            user_prompt=user_prompt,
            temperature=0.10,
        )
    except ValueError as e:
        msg = str(e)
        if "timed out" in msg or "timeout" in msg.lower():
            log.error("Gemini timeout: %s", msg)
            return _fallback_report(
                "[ SYSTEM OVERLOAD — REFRAME AND RETRY ]"
            )
        log.error("JSON parse / API error: %s", msg)
        return _fallback_report("[ INSUFFICIENT VISUAL DATA — REFRAME AND RETRY ]")
    except Exception as e:
        log.error("Gemini call failed: %s", e)
        return _fallback_report("[ SYSTEM OVERLOAD — REFRAME AND RETRY ]")

    # ── is_fashion_item check ─────────────────────────────────────
    # Gemini may return "true"/"false" string, 0/1 int, or bool
    raw_fashion = raw.get("is_fashion_item", True)
    if isinstance(raw_fashion, str):
        is_fashion = raw_fashion.strip().lower() not in ("false", "0", "no")
    elif isinstance(raw_fashion, (int, float)):
        is_fashion = bool(raw_fashion)
    else:
        is_fashion = bool(raw_fashion) if raw_fashion is not None else True

    if is_fashion is False:
        log.info("Non-fashion item explicitly detected by main model")
        return _fallback_report("[ INSUFFICIENT VISUAL DATA — REFRAME AND RETRY ]")

    # ── Normalize ─────────────────────────────────────────────────
    try:
        ai = raw.get("archive_id",      {}) or {}
        ca = raw.get("color_analysis",  {}) or {}
        fe = raw.get("fabric_estimate", {}) or {}
        au = raw.get("authenticity",    {}) or {}
        fi = raw.get("financials",      {}) or {}

        signals = _lst(au, "signals")
        if not signals:
            signals = ["Insufficient data for detailed signal analysis"]

        brand = _s(ai, "brand")

        # Cost is always computed from construction — never trust the
        # model's own arithmetic, sum server-side instead.
        material = round(_f(fi, "material_cost_usd"), 2)
        labor    = round(_f(fi, "labor_cost_usd"), 2)
        total    = round(material + labor, 2)

        # Retail/markup are only meaningful once a brand is confirmed AND that
        # brand actually exists in our known-brand whitelist — a model can
        # read letters off a garment correctly and still name a brand that
        # isn't real (e.g. "ASKAURSE"). Enforced here regardless of what the
        # model returned.
        retail = None
        markup = None
        if brand and brand.strip().upper() != "UNKNOWN" and is_known_brand(brand):
            retail = _f_opt(fi, "estimated_retail_price_usd")
            if retail is not None and total > 0:
                markup = round(retail / total, 2)

        return ArchiveReport(
            archive_id=ArchiveId(
                brand=           brand,
                collection_year= _s(ai, "collection_year"),
                model_name=      _s(ai, "model_name"),
            ),
            color_analysis=ColorAnalysis(
                colorblind_friendly_desc=_s(ca, "colorblind_friendly_desc"),
                hex=_s(ca, "hex"),
            ),
            fabric_estimate=FabricEstimate(
                composition=  _s(fe, "composition"),
                texture_notes=_s(fe, "texture_notes"),
            ),
            authenticity=Authenticity(
                signals=signals,
            ),
            financials=Financials(
                material_cost_usd=material,
                labor_cost_usd=labor,
                total_production_cost_usd=total,
                confidence=_confidence(fi, "confidence"),
                reasoning=_s(fi, "reasoning"),
                estimated_retail_price_usd=retail,
                brand_markup=markup,
            ),
            is_fashion_item=True,
        )

    except Exception as e:
        log.error("ArchiveReport construction failed: %s", e)
        return _fallback_report("[ SYSTEM ERROR — RETRY OPERATION ]")
