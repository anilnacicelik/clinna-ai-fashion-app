/**
 * CLINNA — archive writes
 *
 * Same storage as before: a row in the Supabase `scans` table plus the photo
 * in the `scans_images` bucket (see storageUpload.ts), mirrored into the
 * `@clinna_history` AsyncStorage list that has always been the offline copy.
 * Nothing new is stood up here — this module only moves the write out of
 * ResultScreen so every result screen can share it.
 *
 * What is new is `mode` / `tag_price` / `markup_pct` on the row. Those columns
 * arrive with supabase/v2_events_feedback.sql; until that migration is run the
 * insert falls back to the pre-v2 column set so the app keeps archiving
 * instead of failing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uploadScanImage } from './storageUpload';
import { ArchiveReport, VintedListing } from './api';
import { markupOf } from '../utils/cost';

/** How the scan was taken, as the archive records it. */
export type ArchiveMode = 'buy' | 'full' | 'listing';

const HISTORY_KEY = '@clinna_history';

export interface ArchiveInput {
  mode:     ArchiveMode;
  imageUri: string;
  /** Present for 'buy' and 'full'. */
  report?:  ArchiveReport;
  /** Present for 'listing'. */
  listing?: VintedListing;
  /** Price read off the tag — 'buy' only, null when the user skipped it. */
  tagPrice?: number | null;
}

// ─── Column-compatibility helpers ─────────────────────────────────

/**
 * True when PostgREST rejected the write because a v2 column is not there yet.
 * PGRST204 is "column not found in schema cache"; 42703 is Postgres' own
 * undefined_column, which comes back if the request bypasses the cache.
 */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'PGRST204' || err.code === '42703') return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

// ─── Row shape ────────────────────────────────────────────────────

function rowFor(input: ArchiveInput) {
  if (input.mode === 'listing') {
    const l = input.listing;
    return {
      brand:           l?.brand || null,
      collection_year: null as string | null,
      model_name:      l?.title || null,
      scan_mode:       'listing',
    };
  }
  const r = input.report;
  return {
    brand:           r?.archive_id.brand           || null,
    collection_year: r?.archive_id.collection_year || null,
    model_name:      r?.archive_id.model_name      || null,
    scan_mode:       r?.scan_mode                  || 'quick_scan',
  };
}

/** Markup stored alongside the row so the archive list can show it without the report. */
function markupPctFor(input: ArchiveInput): number | null {
  if (input.mode !== 'buy') return null;
  const m = markupOf(input.tagPrice, input.report?.financials.total_production_cost_usd);
  return m.kind === 'markup' ? m.pct : null;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * File a completed scan. Returns the new row id, which is what REMOVE needs.
 * Throws when the user is signed out or the insert fails — the caller surfaces
 * that as a retryable state rather than pretending the scan was saved.
 */
export async function archiveScan(input: ArchiveInput): Promise<string> {
  // RLS ("Users see own scans") requires user_id = auth.uid() on INSERT —
  // set it explicitly rather than relying solely on the column DEFAULT.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const base = { user_id: user.id, ...rowFor(input) };
  const v2   = {
    mode:       input.mode,
    tag_price:  input.mode === 'buy' ? (input.tagPrice ?? null) : null,
    markup_pct: markupPctFor(input),
  };

  let { data: row, error } = await supabase
    .from('scans')
    .insert({ ...base, ...v2 })
    .select('id')
    .single();

  if (error && isMissingColumn(error)) {
    // Pre-v2 database: file the scan without the new columns rather than
    // losing it. HistoryScreen treats a row with no mode as 'full'.
    console.warn('[CLINNA archive] v2 columns missing — saving without mode/tag_price');
    ({ data: row, error } = await supabase
      .from('scans')
      .insert(base)
      .select('id')
      .single());
  }

  if (error || !row?.id) throw new Error(error?.message ?? 'DB insert failed');

  const scanId: string = row.id;

  // Upload the photo and stamp image_url on the row (see storageUpload.ts).
  // A failed upload leaves a usable text-only row, so it is not fatal.
  if (input.imageUri) {
    await uploadScanImage(input.imageUri, scanId, user.id);
  }

  await saveLocalHistory(scanId, input);

  return scanId;
}

/** Remove a scan the user just filed. Throws so the caller can tell them. */
export async function removeArchivedScan(scanId: string): Promise<void> {
  const { error } = await supabase.from('scans').delete().eq('id', scanId);
  if (error) throw new Error(error.message);
  await removeLocalHistory(scanId);
}

// ─── Offline mirror ───────────────────────────────────────────────

async function saveLocalHistory(scanId: string, input: ArchiveInput): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({
      id:        scanId,
      timestamp: new Date().toISOString(),
      imageUri:  input.imageUri,
      mode:      input.mode,
      tagPrice:  input.mode === 'buy' ? (input.tagPrice ?? null) : null,
      report:    input.report  ?? null,
      listing:   input.listing ?? null,
    });
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 50)));
  } catch (e) {
    console.warn('[CLINNA archive] local history save failed', e);
  }
}

async function removeLocalHistory(scanId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as { id: string }[];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(arr.filter(e => e.id !== scanId)));
  } catch (e) {
    console.warn('[CLINNA archive] local history remove failed', e);
  }
}
