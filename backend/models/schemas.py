"""
CLINNA AI — Schemas v2
New unified ArchiveReport model.
Old LegitResult / CostResult removed; single endpoint, single JSON shape.
"""
from pydantic import BaseModel, Field
from typing import Optional


# ── Sub-models (match the JSON shape exactly) ────────────────────

class ArchiveId(BaseModel):
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
    legit_probability_score: int   = Field(0, ge=-1, le=100)  # -1 = not verifiable (UNKNOWN brand)
    signals:                 list[str] = Field(default_factory=list)


class Financials(BaseModel):
    estimated_production_cost: str = ""
    brand_premium:             str = ""
    current_resell_market_value: str = ""


# ── Preview response (lightweight pre-scan) ──────────────────────

class PreviewReport(BaseModel):
    anomaly_count:   int  = 0
    risk_score:      int  = Field(0, ge=0, le=100)
    category:        str  = ""
    is_fashion_item: bool = True
    processing_ms:   int  = 0


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
