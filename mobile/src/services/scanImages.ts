/**
 * CLINNA — archive photo URLs
 *
 * The scans_images bucket is private (supabase/fix_storage_private.sql), so a
 * stored photo is only viewable through a short-lived signed URL.
 *
 * `scans.image_url` holds one of two things:
 *   - v2.0.1+: the storage path, "<user_id>/<scan_id>/photo.jpg"
 *   - older rows: the full public URL, ".../object/public/scans_images/<path>"
 *
 * Both resolve to a signed URL here — an old public URL is cut back to its
 * path first, so rows written before the bucket went private still open.
 * Anything that is neither (a foreign URL) is passed through untouched.
 */

import { supabase } from './supabase';

const BUCKET = 'scans_images';

/** Signed URLs live this long; the archive list re-signs on every load. */
const SIGNED_URL_TTL_S = 60 * 60;

const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/** Storage path for a stored value, or null when it is not one of ours. */
export function storagePathOf(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return value;
  const idx = value.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  const path = value.slice(idx + PUBLIC_MARKER.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Resolve many stored values at once — one round trip for the whole archive
 * list. The result maps each input value to a displayable URL; a value that
 * could not be signed is simply absent, and the caller shows its placeholder.
 * Never throws.
 */
export async function resolveScanImages(values: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const pathFor: Record<string, string> = {};

  for (const v of values) {
    if (!v) continue;
    const path = storagePathOf(v);
    if (path) pathFor[v] = path;
    else out[v] = v; // foreign URL — nothing to sign
  }

  const paths = Array.from(new Set(Object.values(pathFor)));
  if (paths.length === 0) return out;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    if (error || !data) {
      console.warn('[scanImages] createSignedUrls failed:', error?.message);
      return out;
    }
    const signed: Record<string, string> = {};
    for (const d of data) {
      if (d.path && d.signedUrl && !d.error) signed[d.path] = d.signedUrl;
    }
    for (const [value, path] of Object.entries(pathFor)) {
      if (signed[path]) out[value] = signed[path];
    }
  } catch (e) {
    console.warn('[scanImages] createSignedUrls threw:', e);
  }
  return out;
}

/** Delete every file stored for one scan. Best-effort — never throws. */
export async function removeScanImages(userId: string, scanId: string): Promise<void> {
  try {
    const folder = `${userId}/${scanId}`;
    const { data, error } = await supabase.storage.from(BUCKET).list(folder);
    if (error || !data || data.length === 0) return;
    const files = data.filter(f => f.id).map(f => `${folder}/${f.name}`);
    if (files.length === 0) return;
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(files);
    if (rmError) console.warn('[scanImages] remove failed:', rmError.message);
  } catch (e) {
    console.warn('[scanImages] remove threw:', e);
  }
}
