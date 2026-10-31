/**
 * App-wide controller for the offline model download.
 *
 * - Survives page reloads and crashes: the bytes are in OPFS, and "the user wants the model"
 *   is remembered, so the download resumes on its own when the app is opened again,
 *   when the connection comes back, or when the app returns to the foreground.
 * - Keeps the screen on while downloading.
 */
import {
  requestPersistentStorage,
  toUserMessage,
  type LocalProvider,
  type ModelProgress,
  type ModelStatus,
} from '@ghostledger/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { keepScreenOn } from './wake-lock';

const WANTED_KEY = 'ghostledger.modelDownloadWanted';

export interface ModelDownload {
  status: ModelStatus;
  running: boolean;
  progress: ModelProgress | null;
  error: string | null;
  start: () => void;
  pause: () => void;
  remove: () => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY: ModelStatus = { state: 'none', loaded: 0, total: 0 };

export function useModelDownload(local: LocalProvider | null): ModelDownload {
  const [status, setStatus] = useState<ModelStatus>(EMPTY);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (local) setStatus(await local.status());
  }, [local]);

  const start = useCallback(() => {
    if (!local || abort.current) return;
    localStorage.setItem(WANTED_KEY, '1');
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setError(null);
    const release = keepScreenOn();

    void (async () => {
      try {
        await requestPersistentStorage();
        await local.download((p) => {
          setProgress(p);
          setStatus({ state: 'partial', loaded: p.loaded, total: p.total });
        }, ctrl.signal);
        localStorage.removeItem(WANTED_KEY);
      } catch (err) {
        if ((err as DOMException)?.name !== 'AbortError') setError(toUserMessage(err));
      } finally {
        release();
        abort.current = null;
        setRunning(false);
        setProgress(null);
        await refresh();
      }
    })();
  }, [local, refresh]);

  const pause = useCallback(() => {
    localStorage.removeItem(WANTED_KEY);
    abort.current?.abort();
  }, []);

  const remove = useCallback(async () => {
    pause();
    await local?.deleteModel();
    setError(null);
    await refresh();
  }, [local, pause, refresh]);

  // Initial status, then auto-resume when the user had started a download that didn't finish.
  useEffect(() => {
    if (!local) return;
    let cancelled = false;
    void (async () => {
      const s = await local.status();
      if (cancelled) return;
      setStatus(s);
      if (s.state !== 'complete' && localStorage.getItem(WANTED_KEY) && navigator.onLine) start();
    })();
    return () => {
      cancelled = true;
    };
  }, [local, start]);

  // Resume when the connection comes back or the app returns to the foreground
  // (mobile browsers often kill network requests of backgrounded apps).
  useEffect(() => {
    const maybeResume = () => {
      if (localStorage.getItem(WANTED_KEY) && navigator.onLine && document.visibilityState === 'visible') start();
    };
    window.addEventListener('online', maybeResume);
    document.addEventListener('visibilitychange', maybeResume);
    return () => {
      window.removeEventListener('online', maybeResume);
      document.removeEventListener('visibilitychange', maybeResume);
    };
  }, [start]);

  return { status, running, progress, error, start, pause, remove, refresh };
}
