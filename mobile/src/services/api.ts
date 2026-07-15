/**
 * CLINNA AI — API Service v4
 * "Bulletproof connection" — every error scenario is logged.
 *
 * ── TO CHANGE THE IP: ──────────────────────────────────────────
 *   Update the EXPO_PUBLIC_BACKEND_URL line in .env:
 *   EXPO_PUBLIC_BACKEND_URL=http://192.168.X.X:8000
 * ──────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase';
import { strings } from '../i18n/strings';

// .env → EXPO_PUBLIC_BACKEND_URL=http://192.168.X.X:8000
const _envUrl    = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
const _fallback  = 'http://192.168.1.111:8000';
const _root      = _envUrl || _fallback;

export const BASE_URL    = `${_root}/api/v1`;
export const HEALTH_URL  = `${_root}/health`;
export const DISPLAY_URL = _root;

const TIMEOUT_QUICK_MS = 90_000;
const TIMEOUT_DEEP_MS  = 90_000;

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface ArchiveId {
  brand:           string;
  collection_year: string;
  model_name:      string;
}
export interface ColorAnalysis {
  colorblind_friendly_desc: string;
  hex:                      string;
}
export interface FabricEstimate {
  composition:   string;
  texture_notes: string;
}
export interface Authenticity {
  // Observable construction signals only — CLINNA never scores authenticity.
  signals: string[];
}
export interface Financials {
  material_cost_usd:           number;
  labor_cost_usd:               number;
  total_production_cost_usd:    number;
  confidence:                   'low' | 'medium' | 'high';
  reasoning:                     string;
  estimated_retail_price_usd:  number | null;  // null unless brand is confirmed
  brand_markup:                 number | null;  // null unless brand is confirmed
}
export interface ArchiveReport {
  archive_id:      ArchiveId;
  color_analysis:  ColorAnalysis;
  fabric_estimate: FabricEstimate;
  authenticity:    Authenticity;
  financials:      Financials;
  is_fashion_item: boolean;
  processing_ms:   number;
  scan_mode:       'quick_scan' | 'deep_auth' | 'acc';
  image_count:     number;
}
export type ScanMode = 'quick_scan' | 'deep_auth' | 'acc';
export interface DeepAuthImages {
  product: string;
  label?:  string;
  tag?:    string;
}

// ═══════════════════════════════════════════════════════════════════
// ApiError
// ═══════════════════════════════════════════════════════════════════

export class ApiError extends Error {
  constructor(
    public code:               number,
    message:                   string,
    public retryable:          boolean = false,
    public retryAfterSeconds?: number,
    public debugReason?:       string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ═══════════════════════════════════════════════════════════════════
// XHR POST — iOS native URLSession timeout'unu override eder
// fetch + AbortController cannot exceed iOS's 60s hard timeout;
// XMLHttpRequest.timeout sets NSURLSession directly.
// ═══════════════════════════════════════════════════════════════════

/** Current Supabase session's access token, as an Authorization header (or {} if signed out). */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function xhrPost(
  url:       string,
  body:      FormData,
  timeoutMs: number,
  headers:   Record<string, string> = {},
): Promise<Response> {
  const startedAt = Date.now();
  console.log(`[CLINNA API] → POST ${url} (XHR timeout=${timeoutMs}ms)`);

  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';
    xhr.timeout = timeoutMs; // iOS NSURLSession timeout'unu override eder
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.onload = () => {
      const elapsed = Date.now() - startedAt;
      console.log(`[CLINNA API] ← HTTP ${xhr.status} (${elapsed}ms)`);
      const headers = new Headers();
      xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
        const idx = line.indexOf(': ');
        if (idx > 0) headers.append(line.slice(0, idx), line.slice(idx + 2));
      });
      resolve(new Response(xhr.responseText, {
        status:     xhr.status,
        statusText: xhr.statusText,
        headers,
      }));
    };

    xhr.ontimeout = () => {
      const elapsed = Date.now() - startedAt;
      console.error(`[CLINNA API] XHR TIMEOUT ${elapsed}ms → ${url}`);
      reject(new ApiError(
        408,
        strings.common.errors.requestTimeout,
        true,
        undefined,
        `XHR timeout (${timeoutMs}ms) — server did not respond — ${url}`,
      ));
    };

    xhr.onerror = () => {
      const elapsed = Date.now() - startedAt;
      console.error(`[CLINNA API] XHR ERROR ${elapsed}ms → ${url}`);
      console.error(`[CLINNA API] URL    : ${url}`);
      console.error(`[CLINNA API] HOST   : ${DISPLAY_URL}`);
      console.error(`[CLINNA API] HINT   : .env → EXPO_PUBLIC_BACKEND_URL=http://<LAN_IP>:8000`);
      reject(new ApiError(
        0,
        strings.common.errors.backendUnreachable,
        true,
        undefined,
        `Network error — check your Wi-Fi connection — ${url}`,
      ));
    };

    xhr.send(body);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Fetch core — for GET requests only (health check)
// ═══════════════════════════════════════════════════════════════════

async function fetchWithTimeout(
  url:       string,
  options:   RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl      = new AbortController();
  const timerId   = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();

  console.log(`[CLINNA API] → ${options.method ?? 'GET'} ${url}`);

  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    console.log(`[CLINNA API] ← HTTP ${res.status} (${Date.now() - startedAt}ms)`);
    return res;
  } catch (err: any) {
    const elapsed = Date.now() - startedAt;

    if (err.name === 'AbortError') {
      console.error(`[CLINNA API] TIMEOUT ${elapsed}ms → ${url}`);
      throw new ApiError(
        408,
        strings.common.errors.requestTimeout,
        true,
        undefined,
        `Timeout (${timeoutMs}ms) — server did not respond — ${url}`,
      );
    }

    const reason = (() => {
      const msg = (err.message ?? '').toLowerCase();
      if (msg.includes('network request failed')) return 'Network request failed — wrong IP or backend is down';
      if (msg.includes('connection refused'))     return 'Connection refused — is uvicorn running?';
      if (msg.includes('econnrefused'))           return 'ECONNREFUSED — port is closed';
      if (msg.includes('timeout'))                return 'Connection timeout — are you on the same Wi-Fi?';
      if (msg.includes('network'))                return 'Network error — check your Wi-Fi connection';
      return `Unknown error: ${err.message}`;
    })();

    console.error(`[CLINNA API] ── NETWORK ERROR ──────────────────`);
    console.error(`[CLINNA API] URL    : ${url}`);
    console.error(`[CLINNA API] HOST   : ${DISPLAY_URL}`);
    console.error(`[CLINNA API] REASON : ${reason}`);
    console.error(`[CLINNA API] RAW    :`, err);
    console.error(`[CLINNA API] HINT   : .env → EXPO_PUBLIC_BACKEND_URL=http://<LAN_IP>:8000`);

    throw new ApiError(
      0,
      strings.common.errors.backendUnreachable,
      true,
      undefined,
      `${reason} — ${url}`,
    );
  } finally {
    clearTimeout(timerId);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Response handler
// ═══════════════════════════════════════════════════════════════════

async function handleResponse(res: Response): Promise<ArchiveReport> {
  if (res.status === 429) {
    const after = parseInt(res.headers.get('Retry-After') ?? '30', 10);
    console.warn(`[CLINNA API] 429 Quota — retry after ${after}s`);
    throw new ApiError(429, strings.common.errors.systemBusy(after), true, after, 'Gemini rate limit');
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
      console.error(`[CLINNA API] HTTP ${res.status} body:`, j);
    } catch {
      console.error(`[CLINNA API] HTTP ${res.status} — could not parse body`);
    }
    // 4xx details are curated, user-facing backend messages (e.g. "Image too
    // large. Max 10 MB.") — safe to show as-is. 5xx details can carry
    // implementation-flavored text, so use the generic message instead.
    const isServerError = res.status >= 500;
    const message = isServerError ? strings.common.errors.serverError : detail;
    throw new ApiError(res.status, message, isServerError);
  }

  try {
    const data = await res.json();
    console.log('[CLINNA API] Response OK — parsed ArchiveReport');
    return data as ArchiveReport;
  } catch (e) {
    console.error('[CLINNA API] JSON parse failed:', e);
    throw new ApiError(0, strings.common.errors.invalidResponse, false);
  }
}

// ═══════════════════════════════════════════════════════════════════
// File helper — URI → FormData part (React Native multipart format)
// ═══════════════════════════════════════════════════════════════════

function uriToFormPart(uri: string): { uri: string; name: string; type: string } {
  const rawName  = uri.split('/').pop() ?? 'photo.jpg';
  const lower    = rawName.toLowerCase();
  const isPng    = lower.endsWith('.png');
  const name     = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || isPng
    ? rawName
    : `${rawName}.jpg`;
  const type     = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  console.log(`[CLINNA API] FormPart: name=${name} type=${type} uri=...${uri.slice(-40)}`);
  return { uri, name, type };
}

// ═══════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════

/** Quick Scan — single image */
export async function quickScan(imageUri: string): Promise<ArchiveReport> {
  console.log('[CLINNA API] quickScan start');
  const body = new FormData();
  body.append('image', uriToFormPart(imageUri) as any);

  const res = await xhrPost(`${BASE_URL}/analyze`, body, TIMEOUT_QUICK_MS, await authHeaders());
  return handleResponse(res);
}

/** Deep Auth / Accessory — 1-3 images; only product is required */
export async function deepAuth(imgs: DeepAuthImages, scanMode: 'deep_auth' | 'acc' = 'deep_auth'): Promise<ArchiveReport> {
  const imgCount = [imgs.product, imgs.label, imgs.tag].filter(Boolean).length;
  console.log(`[CLINNA API] deepAuth start — ${imgCount} images — mode=${scanMode}`);
  const body = new FormData();
  body.append('image_product', uriToFormPart(imgs.product) as any);
  if (imgs.label) body.append('image_label', uriToFormPart(imgs.label) as any);
  if (imgs.tag)   body.append('image_tag',   uriToFormPart(imgs.tag)   as any);
  body.append('scan_mode', scanMode);

  const res = await xhrPost(`${BASE_URL}/analyze/deep`, body, TIMEOUT_DEEP_MS, await authHeaders());
  return handleResponse(res);
}

/** Permanently deletes the signed-in user's account and all associated data. */
export async function deleteAccount(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetchWithTimeout(
    `${BASE_URL}/account`,
    { method: 'DELETE', headers },
    15_000,
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
    } catch {}
    throw new ApiError(res.status, `ACCOUNT DELETION FAILED — ${detail}`, res.status >= 500);
  }
}

/** Health check — is the backend reachable? */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const t = Date.now();
  try {
    const res = await fetchWithTimeout(HEALTH_URL, { method: 'GET' }, 5_000);
    return { ok: res.ok, latencyMs: Date.now() - t };
  } catch (e) {
    console.warn('[CLINNA API] Health check failed:', e);
    return { ok: false, latencyMs: Date.now() - t };
  }
}

export const CONFIG = {
  displayUrl: DISPLAY_URL,
  baseUrl:    BASE_URL,
} as const;
