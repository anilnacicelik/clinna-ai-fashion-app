"""
CLINNA AI — Analyze Router v2
GET  /health  (main.py)
POST /api/v1/analyze          — quick_scan: single image
POST /api/v1/analyze/deep     — deep_auth:  1-3 images
"""
import time
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Depends
from models.schemas import ArchiveReport
from analyzers.archivist import run_archive_analysis
from services.auth import require_user
from services.rate_limit import limiter

router = APIRouter()

MAX_SIZE   = 10 * 1024 * 1024  # 10 MB per image
VALID_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _validate_image(img: UploadFile) -> str:
    ct = (img.content_type or "").lower()
    if not ct.startswith("image/"):
        raise HTTPException(400, f"File '{img.filename}' is not an image.")
    return ct if ct in VALID_MIME else "image/jpeg"


# ── QUICK SCAN ────────────────────────────────────────────────────

@router.post("/analyze", response_model=ArchiveReport)
@limiter.limit("20/minute")
async def analyze_quick(
    request: Request,
    image: UploadFile = File(..., description="Single garment photo"),
    user_id: str = Depends(require_user),
):
    """Quick Scan — single image, fastest response."""
    mime = _validate_image(image)
    data = await image.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "Image too large. Max 10 MB.")

    t0 = time.monotonic()
    report = await run_archive_analysis(images=[(data, mime)], scan_mode="quick_scan")
    report.processing_ms = int((time.monotonic() - t0) * 1000)
    report.scan_mode     = "quick_scan"
    report.image_count   = 1
    return report


# ── DEEP AUTH ─────────────────────────────────────────────────────

@router.post("/analyze/deep", response_model=ArchiveReport)
@limiter.limit("20/minute")
async def analyze_deep(
    request: Request,
    image_product: UploadFile = File(...,  description="Full product / garment shot"),
    image_label:   UploadFile = File(None, description="Interior brand label (optional)"),
    image_tag:     UploadFile = File(None, description="Wash care tag / barcode (optional)"),
    scan_mode:     str        = Form("deep_auth", description="Scan mode: deep_auth | acc"),
    user_id:       str        = Depends(require_user),
):
    """Deep Auth / Accessory — 1 to 3 images; only product is required."""
    if scan_mode not in ("deep_auth", "acc"):
        scan_mode = "deep_auth"

    images: list[tuple[bytes, str]] = []

    for img in [image_product, image_label, image_tag]:
        if img is None:
            continue
        mime = _validate_image(img)
        data = await img.read()
        if len(data) > MAX_SIZE:
            raise HTTPException(413, f"Image '{img.filename}' too large. Max 10 MB.")
        images.append((data, mime))

    if len(images) < 1:
        raise HTTPException(400, "At least one image (product) is required.")

    t0 = time.monotonic()
    report = await run_archive_analysis(images=images, scan_mode=scan_mode)
    report.processing_ms = int((time.monotonic() - t0) * 1000)
    report.scan_mode     = scan_mode
    report.image_count   = len(images)
    return report
