"""
CLINNA AI — Vision Service v6
Changes v5 → v6:
  - Fashion pre-check (vision_is_fashion_quick) removed — Master Plan 01
  - Single, direct Gemini call: vision_analyze_multi
  - asyncio.wait_for (GEMINI_TIMEOUT=40s) preserved — well under iOS 75s limit
"""
import json
import os
import asyncio
import logging
from typing import Any

from google import genai
from google.genai import types

log = logging.getLogger("clinna.vision")

# Timeout is enforced by asyncio.wait_for in vision_analyze_multi (40s hard ceiling)
client = genai.Client(
    api_key=os.environ["GEMINI_API_KEY"],
)

MODEL = "gemini-2.5-flash"

SUPPORTED_MIMES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _extract_json(text: str) -> dict:
    """Safely extract the JSON block from Gemini's output."""
    cleaned = text.replace("```json", "").replace("```", "").strip()

    start = cleaned.find("{")
    end   = cleaned.rfind("}")

    if start != -1 and end != -1 and end > start:
        json_str = cleaned[start : end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            log.error("JSON decode failed: %s", e)
            log.error("Raw JSON string (first 500): %s", json_str[:500])
            raise ValueError(f"JSON parse error: {e}") from e

    log.error("No JSON braces found in response (first 300 chars): %s", text[:300])
    raise ValueError(f"No JSON object found in response:\n{text[:400]}")


def _build_image_parts(images: list[tuple[bytes, str]]) -> list:
    """(bytes, mime_type) → list of types.Part."""
    parts = []
    for i, (data, mime) in enumerate(images):
        log.info("Image part %d/%d — mime=%s size=%d bytes", i + 1, len(images), mime, len(data))
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))
    return parts


async def _call_gemini_async(
    images:           list[tuple[bytes, str]],
    system_prompt:    str,
    user_prompt:      str,
    temperature:      float,
    max_output_tokens: int = 2000,
) -> dict[str, Any]:
    """
    Native async Gemini call — does not use asyncio.to_thread.
    asyncio.wait_for can cancel this coroutine immediately in Python 3.12+.
    """
    image_parts = _build_image_parts(images)
    contents    = [types.Part.from_text(text=user_prompt)] + image_parts

    log.info("Calling Gemini model=%s images=%d temp=%.2f max_tokens=%d", MODEL, len(images), temperature, max_output_tokens)

    try:
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                system_instruction=system_prompt,
            ),
        )
    except Exception as e:
        log.error("Gemini API call failed: %s: %s", type(e).__name__, e)
        raise ValueError(f"Gemini API call failed: {type(e).__name__}: {e}") from e

    raw_text = getattr(response, "text", None)

    if not raw_text or not raw_text.strip():
        finish = "unknown"
        try:
            if response.candidates:
                finish = str(getattr(response.candidates[0], "finish_reason", "unknown"))
        except Exception:
            pass
        log.error("Empty response from Gemini — finish_reason=%s", finish)
        raise ValueError(f"Gemini returned empty response (finish_reason={finish})")

    log.info("Gemini response received — %d chars", len(raw_text))
    return _extract_json(raw_text)


GEMINI_TIMEOUT = 40  # seconds — 1.5-flash typically 5-15s; 40s hard ceiling, well under iOS 75s limit


async def vision_analyze_multi(
    images:            list[tuple[bytes, str]],
    system_prompt:     str,
    user_prompt:       str,
    temperature:       float = 0.15,
    max_output_tokens: int   = 2000,
) -> dict[str, Any]:
    """
    Single direct Gemini call. No pre-check gate.
    asyncio.wait_for enforces 40s hard timeout; httpx cap is 35s.
    """
    log.info(
        "vision_analyze_multi start — images=%d total_bytes=%d",
        len(images),
        sum(len(b) for b, _ in images),
    )
    try:
        return await asyncio.wait_for(
            _call_gemini_async(images, system_prompt, user_prompt, temperature, max_output_tokens),
            timeout=GEMINI_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.error("Gemini hard timeout after %ds", GEMINI_TIMEOUT)
        raise ValueError(f"Gemini timed out after {GEMINI_TIMEOUT}s")
