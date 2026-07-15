"""
CLINNA AI — Schemas v2
New unified ArchiveReport model.
Old LegitResult / CostResult removed; single endpoint, single JSON shape.
"""
from pydantic import BaseModel, Field
from typing import Optional


# ── Sub-models (match the JSON shape exactly) ────────────────────

class ArchiveId(BaseModel):
    model_config = {"protected_namespaces": ()}  # allow field name "model_name"

    brand:           str = ""
    collection_year: str = ""
    model_name:      str = ""


class ColorAnalysis(BaseModel):
    colorblind_friendly_desc: str = ""
    hex:                      str = ""


class FabricEstimate(BaseModel):
    composition:   str = ""
    texture_notes: str = ""


class Authenticity(BaseModel):
    # Observable construction signals only — CLINNA never judges authenticity
    # or outputs a probability/confidence score (legal risk: Gemini Vision
    # has no brand-specific fine-tuning to back up such a verdict).
    signals: list[str] = Field(default_factory=list)


class Financials(BaseModel):
    # Cost estimation is always performed from visible construction alone,
    # independent of whether the brand could be identified.
    material_cost_usd:          float = 0
    labor_cost_usd:              float = 0
    total_production_cost_usd:   float = 0
    confidence:                  str   = "low"  # 'low' | 'medium' | 'high'
    reasoning:                   str   = ""
    # Only populated when brand is confirmed — null otherwise.
    estimated_retail_price_usd: Optional[float] = None
    brand_markup:                Optional[float] = None


# ── Top-level response ────────────────────────────────────────────

class ArchiveReport(BaseModel):
    archive_id:      ArchiveId
    color_analysis:  ColorAnalysis
    fabric_estimate: FabricEstimate
    authenticity:    Authenticity
    financials:      Financials
    is_fashion_item: bool        = True
    processing_ms:   int         = 0
    scan_mode:       str         = "quick_scan"
    image_count:     int         = 1
