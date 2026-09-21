/**
 * CLINNA — store review prompt
 *
 * Asked once, ever, and only from a place where the app has just worked: a
 * result screen, after the third successful scan. Never from an error state
 * and never from the paywall — both call sites are result screens only.
 *
 * iOS decides whether the sheet actually appears (Apple rate-limits it to a
 * few times a year); `hasShown` records that CLINNA asked, not that the user
 * saw anything, which is the conservative direction to be wrong in.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { track } from './analytics';

const COUNT_KEY = '@clinna_success_scan_count';
const ASKED_KEY = '@clinna_review_asked';

/** Number of successful scans before the prompt is allowed. */
const THRESHOLD = 3;

/**
 * Serialises every counter write and lets maybeRequestReview() wait on them.
 *
 * Without this the third scan would be missed: CameraScreen counts the scan
 * and navigates in the same tick, so the result screen would read the counter
 * back before the increment had landed in AsyncStorage. Chaining also stops
 * two quick scans from reading the same value and losing one increment.
 */
let pending: Promise<void> = Promise.resolve();

/** Count one successful scan. Called from CameraScreen on success. */
export function noteSuccessfulScan(): Promise<void> {
  pending = pending
    .then(async () => {
      const raw  = await AsyncStorage.getItem(COUNT_KEY);
      const next = (parseInt(raw ?? '0', 10) || 0) + 1;
      await AsyncStorage.setItem(COUNT_KEY, String(next));
    })
    .catch(e => { console.warn('[CLINNA review] could not count scan:', e); });
  return pending;
}

/**
 * Ask for a rating if this is the right moment. Safe to call on every result
 * screen open — it is a no-op in every case but one.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    // Let the scan that just produced this screen finish being counted.
    await pending;

    if (await AsyncStorage.getItem(ASKED_KEY)) return;

    const count = parseInt((await AsyncStorage.getItem(COUNT_KEY)) ?? '0', 10) || 0;
    if (count < THRESHOLD) return;

    if (!(await StoreReview.isAvailableAsync())) return;

    // Written before the request, not after: if anything below throws or the
    // app is killed mid-sheet, the user is not asked a second time.
    await AsyncStorage.setItem(ASKED_KEY, 'true');
    track('review_prompt_shown');
    await StoreReview.requestReview();
  } catch (e) {
    console.warn('[CLINNA review] prompt skipped:', e);
  }
}
