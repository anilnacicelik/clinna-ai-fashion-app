/**
 * CLINNA AI — useAnalysis v3
 * Manages Quick Scan and Deep Auth modes through a single hook.
 * Includes 429 quota countdown and detailed error logging.
 */
import { useState, useCallback, useRef } from 'react';
import { quickScan, deepAuth, ArchiveReport, ApiError, DeepAuthImages, ScanMode } from '../services/api';
import { compressForUpload } from '../services/imageCompress';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; mode: ScanMode }
  | { status: 'success'; data: ArchiveReport }
  | { status: 'error';   message: string; retryable: boolean }
  | { status: 'quota';   countdown: number };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startCountdown = useCallback((seconds: number) => {
    clearTimer();
    setState({ status: 'quota', countdown: seconds });
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.status !== 'quota') return prev;
        const next = prev.countdown - 1;
        if (next <= 0) { clearTimer(); return { status: 'idle' }; }
        return { ...prev, countdown: next };
      });
    }, 1000);
  }, []);

  const _handleError = useCallback((err: unknown) => {
    // Detailed logging — always print to console
    console.error('[CLINNA] Analysis error:', err);

    if (err instanceof ApiError) {
      console.error(
        `[CLINNA] ApiError — code: ${err.code} | retryable: ${err.retryable} | debug: "${err.debugReason ?? 'n/a'}"`
      );
      if (err.code === 429) return startCountdown(err.retryAfterSeconds ?? 30);
      setState({ status: 'error', message: err.message, retryable: err.retryable });
    } else {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('[CLINNA] Unknown error type:', raw);
      setState({ status: 'error', message: `UNEXPECTED ERROR: ${raw}`, retryable: true });
    }
  }, [startCountdown]);

  const runQuickScan = useCallback(async (imageUri: string) => {
    setState({ status: 'loading', mode: 'quick_scan' });
    try {
      console.log('[CLINNA] compressForUpload start — uri:', imageUri.slice(-50));
      const compressed = await compressForUpload(imageUri);
      console.log('[CLINNA] compressForUpload done  — uri:', compressed.slice(-50));
      const data = await quickScan(compressed);
      setState({ status: 'success', data });
    } catch (err) {
      console.error('[CLINNA] Quick scan error:', err);
      _handleError(err);
    }
  }, [_handleError]);

  const runDeepAuth = useCallback(async (imgs: DeepAuthImages) => {
    setState({ status: 'loading', mode: 'deep_auth' });
    try {
      console.log('[CLINNA] compressForUpload (deep) start');
      const [product, label, tag] = await Promise.all([
        compressForUpload(imgs.product),
        imgs.label ? compressForUpload(imgs.label) : Promise.resolve(undefined),
        imgs.tag   ? compressForUpload(imgs.tag)   : Promise.resolve(undefined),
      ]);
      console.log('[CLINNA] compressForUpload (deep) done');
      const data = await deepAuth({ product, ...(label ? { label } : {}), ...(tag ? { tag } : {}) }, 'deep_auth');
      setState({ status: 'success', data });
    } catch (err) {
      console.error('[CLINNA] Deep auth error:', err);
      _handleError(err);
    }
  }, [_handleError]);

  const runAccScan = useCallback(async (imgs: DeepAuthImages) => {
    setState({ status: 'loading', mode: 'acc' });
    try {
      console.log('[CLINNA] compressForUpload (acc) start');
      const [product, label, tag] = await Promise.all([
        compressForUpload(imgs.product),
        imgs.label ? compressForUpload(imgs.label) : Promise.resolve(undefined),
        imgs.tag   ? compressForUpload(imgs.tag)   : Promise.resolve(undefined),
      ]);
      console.log('[CLINNA] compressForUpload (acc) done');
      const data = await deepAuth({ product, ...(label ? { label } : {}), ...(tag ? { tag } : {}) }, 'acc');
      setState({ status: 'success', data });
    } catch (err) {
      console.error('[CLINNA] ACC Error:', err);
      _handleError(err);
    }
  }, [_handleError]);

  const reset = useCallback(() => { clearTimer(); setState({ status: 'idle' }); }, []);

  return { state, runQuickScan, runDeepAuth, runAccScan, reset };
}
