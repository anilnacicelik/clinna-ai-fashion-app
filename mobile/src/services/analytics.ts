/**
 * CLINNA — product analytics
 *
 * One table, one call: `track('scan_succeeded', { mode: 'buy' })`.
 *
 * Rules this module enforces, not just documents:
 *   - Fire and forget. `track()` returns void and never blocks a render, a
 *     navigation or a button handler. Callers must not await it.
 *   - Never throws. A missing table, an expired token or no network degrades
 *     to a console.warn — an analytics failure can never break the app.
 *   - No personal data. user_id (only when signed in), the event name, a few
 *     small props, platform and app version. No email, no name, no photo, no
 *     free text the user typed. The single number that is allowed through is
 *     a price, which carries nothing identifying.
 *
 * Schema: supabase/v2_events_feedback.sql
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * app.json → expo.version, read from the manifest rather than duplicated here
 * so a version bump cannot silently leave the analytics stamped with the old
 * one. `expoConfig` is null in a few edge cases (a bare workflow host, some
 * test runners), hence the fallback — this value is a label, never a gate.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

export type AnalyticsEvent =
  | 'app_open'
  | 'sample_report_viewed'
  | 'scan_started'
  | 'scan_succeeded'
  | 'scan_failed'
  | 'tag_price_entered'
  | 'tag_price_skipped'
  | 'share_tapped'
  | 'full_report_tapped'
  | 'archive_item_removed'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_succeeded'
  | 'feedback_sent'
  | 'review_prompt_shown';

/** Small, non-identifying values only. */
export type AnalyticsProps = Record<string, string | number | boolean | null>;

/**
 * Record an event. Returns immediately — the insert runs detached.
 */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  // Deliberately not awaited, and the promise is swallowed inside send() so
  // this can never surface as an unhandled rejection.
  void send(event, props);
}

async function send(event: AnalyticsEvent, props: AnalyticsProps): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from('events').insert({
      user_id:     session?.user?.id ?? null,
      event,
      props,
      platform:    Platform.OS,
      app_version: APP_VERSION,
    });

    if (error) {
      // Includes the "relation public.events does not exist" case, i.e. the
      // migration has not been run yet. Nothing to do but note it.
      console.warn(`[CLINNA analytics] ${event} not recorded:`, error.message);
    }
  } catch (e) {
    console.warn(`[CLINNA analytics] ${event} not recorded:`, e);
  }
}
