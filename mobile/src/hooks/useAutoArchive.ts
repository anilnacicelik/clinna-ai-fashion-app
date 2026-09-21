/**
 * CLINNA — useAutoArchive
 *
 * Every successful scan is filed the moment its result screen opens. The user
 * no longer presses a save button; they press REMOVE if they did not want it.
 *
 * Exactly-once is enforced by `archiveKey` — a string minted by CameraScreen
 * when the scan succeeds and carried through the navigation params. A module
 * level registry keys off it, so none of these produce a second row:
 *   - a re-render or a remount of the result screen
 *   - navigating BuyResult → FULL REPORT, which opens ResultScreen over the
 *     same report with the same key
 *   - going back to the result screen from somewhere further up the stack
 *
 * The registry is deliberately in module scope and never cleared: it is a few
 * bytes per scan, and it has to outlive the screens it protects.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { archiveScan, removeArchivedScan, ArchiveInput } from '../services/archive';

export type ArchiveState = 'idle' | 'saving' | 'saved' | 'error' | 'removed';

interface Entry {
  state:   ArchiveState;
  scanId:  string | null;
  promise: Promise<string> | null;
}

const registry = new Map<string, Entry>();

export interface UseAutoArchiveResult {
  /** False when archiving is off for this screen — render no status row. */
  enabled:  boolean;
  state:    ArchiveState;
  /** Delete the row this scan created. No-op unless the scan is saved. */
  remove:   () => Promise<void>;
  /** Re-run a failed save. No-op in every other state. */
  retry:    () => void;
  removing: boolean;
}

/**
 * @param archiveKey  stable id for this scan, or null to disable archiving
 *                    entirely (sample report, guest scan, signed-out user).
 */
export function useAutoArchive(
  archiveKey: string | null,
  input:      ArchiveInput,
): UseAutoArchiveResult {
  const [state, setState]       = useState<ArchiveState>(() =>
    archiveKey ? (registry.get(archiveKey)?.state ?? 'idle') : 'idle',
  );
  const [removing, setRemoving] = useState(false);

  // Read inside the effect without making it a dependency — the input object
  // is rebuilt on every render, and re-running on identity alone would fight
  // the whole point of the registry.
  const inputRef = useRef(input);
  inputRef.current = input;

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback((key: string) => {
    let entry = registry.get(key);

    if (!entry || entry.state === 'error') {
      const promise = archiveScan(inputRef.current);
      entry = { state: 'saving', scanId: null, promise };
      registry.set(key, entry);

      promise
        .then(scanId => {
          registry.set(key, { state: 'saved', scanId, promise: null });
          if (mounted.current) setState('saved');
        })
        .catch(err => {
          console.error('[CLINNA archive] auto-save failed:', err);
          registry.set(key, { state: 'error', scanId: null, promise: null });
          if (mounted.current) setState('error');
        });

      setState('saving');
      return;
    }

    // Another screen already started (or finished) this one.
    setState(entry.state);
    if (entry.state === 'saving' && entry.promise) {
      entry.promise
        .then(() => { if (mounted.current) setState(registry.get(key)?.state ?? 'saved'); })
        .catch(() => { if (mounted.current) setState('error'); });
    }
  }, []);

  useEffect(() => {
    if (!archiveKey) return;
    run(archiveKey);
  }, [archiveKey, run]);

  const retry = useCallback(() => {
    if (!archiveKey) return;
    if (registry.get(archiveKey)?.state !== 'error') return;
    run(archiveKey);
  }, [archiveKey, run]);

  const remove = useCallback(async () => {
    if (!archiveKey) return;
    const entry = registry.get(archiveKey);
    if (!entry || entry.state !== 'saved' || !entry.scanId) return;

    setRemoving(true);
    try {
      await removeArchivedScan(entry.scanId);
      registry.set(archiveKey, { state: 'removed', scanId: null, promise: null });
      if (mounted.current) setState('removed');
    } finally {
      if (mounted.current) setRemoving(false);
    }
  }, [archiveKey]);

  return { enabled: !!archiveKey, state, remove, retry, removing };
}
