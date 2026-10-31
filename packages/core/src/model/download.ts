/**
 * Resumable model download.
 *
 * Each file is streamed straight to storage with HTTP Range requests, so:
 *  - memory stays at a few MB (Transformers.js would hold a whole 1.5 GB file in memory);
 *  - after a crash, reload, lost connection or pause, it continues from the last byte written;
 *  - network errors are retried with backoff.
 *
 * Storage is abstracted (FileSink / ModelStore) so this logic is unit-tested without a browser.
 */
import { modelFileUrl, type ModelFile, type ModelManifest } from './files';

/** One open file. In the browser: an OPFS FileSystemSyncAccessHandle. */
export interface FileSink {
  size(): number;
  truncate(size: number): void;
  write(chunk: Uint8Array, at: number): void;
  flush(): void;
  close(): void;
}

export interface ModelStore {
  readManifest(): Promise<ModelManifest | null>;
  writeManifest(manifest: ModelManifest): Promise<void>;
  open(path: string): Promise<FileSink>;
}

export interface DownloadProgress {
  /** Bytes on disk across all files */
  loaded: number;
  total: number;
  /** 0–100 */
  percent: number;
  /** File being downloaded right now */
  file: string | null;
  status: 'preparing' | 'downloading' | 'retrying' | 'done';
  /** Set while waiting to retry */
  retryInMs?: number;
  /** Why the last attempt failed (shown while retrying) */
  lastError?: string;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  fetch?: typeof fetch;
  /** Consecutive failures (without any progress in between) before giving up. */
  maxRetries?: number;
  /** For tests */
  sleep?: (ms: number) => Promise<void>;
  /** Flush to disk at least every N bytes */
  flushEvery?: number;
  /** Minimum time between progress events */
  progressIntervalMs?: number;
}

export class DownloadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'DownloadError';
  }
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });

const isAbort = (err: unknown) => (err as { name?: string })?.name === 'AbortError';

/**
 * Downloads (or resumes) every file in the manifest. `getManifest` is only called when no
 * manifest is stored yet, so a resumed download keeps its pinned revision and file list.
 */
export async function downloadModel(
  store: ModelStore,
  getManifest: () => Promise<ModelManifest>,
  opts: DownloadOptions = {},
): Promise<ModelManifest> {
  // Bind: calling the native fetch as a method of another object throws "Illegal invocation".
  const fetchFn = opts.fetch ?? fetch.bind(globalThis);
  const sleep = opts.sleep ?? ((ms: number) => defaultSleep(ms, opts.signal));
  const maxRetries = opts.maxRetries ?? 8;
  const flushEvery = opts.flushEvery ?? 16 * 1024 * 1024;
  const progressIntervalMs = opts.progressIntervalMs ?? 250;

  let manifest = await store.readManifest();
  if (!manifest) {
    opts.onProgress?.({ loaded: 0, total: 0, percent: 0, file: null, status: 'preparing' });
    manifest = await getManifest();
    await store.writeManifest(manifest);
  }
  const m = manifest;

  // What's already on disk (this is what makes it resumable).
  const done = new Map<string, number>();
  for (const f of m.files) {
    const sink = await store.open(f.path);
    try {
      let size = sink.size();
      if (size > f.size) {
        sink.truncate(0); // corrupt/oversized: start this file again
        size = 0;
      }
      done.set(f.path, size);
    } finally {
      sink.close();
    }
  }

  const loaded = () => [...done.values()].reduce((a, b) => a + b, 0);
  let lastReport = 0;
  const report = (file: string | null, status: DownloadProgress['status'], extra: Partial<DownloadProgress> = {}, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < progressIntervalMs) return;
    lastReport = now;
    const l = loaded();
    opts.onProgress?.({
      loaded: l,
      total: m.totalBytes,
      percent: m.totalBytes ? Math.min(100, (l / m.totalBytes) * 100) : 0,
      file,
      status,
      ...extra,
    });
  };

  for (const file of m.files) {
    let failures = 0;
    while ((done.get(file.path) ?? 0) < file.size) {
      opts.signal?.throwIfAborted();
      const before = done.get(file.path) ?? 0;
      try {
        await downloadFile(store, m, file, {
          fetchFn,
          signal: opts.signal,
          flushEvery,
          onBytes: (n) => {
            done.set(file.path, n);
            report(file.path, 'downloading');
          },
        });
      } catch (err) {
        if (isAbort(err) || opts.signal?.aborted) throw err;
        if (err instanceof DownloadError && !err.retryable) throw err;
        // Any progress resets the failure counter: flaky mobile networks are expected.
        failures = (done.get(file.path) ?? 0) > before ? 1 : failures + 1;
        if (failures > maxRetries) {
          throw new DownloadError(`Download keeps failing (${(err as Error).message}). It will resume from here next time.`, true);
        }
        const wait = Math.min(30_000, 1000 * 2 ** (failures - 1));
        report(file.path, 'retrying', { retryInMs: wait, lastError: (err as Error)?.message ?? String(err) }, true);
        await sleep(wait);
      }
    }
  }

  m.complete = true;
  await store.writeManifest(m);
  report(null, 'done', {}, true);
  return m;
}

async function downloadFile(
  store: ModelStore,
  m: ModelManifest,
  file: ModelFile,
  ctx: { fetchFn: typeof fetch; signal?: AbortSignal; flushEvery: number; onBytes: (n: number) => void },
): Promise<void> {
  const sink = await store.open(file.path);
  try {
    let offset = sink.size();
    if (offset >= file.size) return;

    const res = await ctx.fetchFn(modelFileUrl(m.modelId, m.revision, file.path), {
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
      signal: ctx.signal,
      cache: 'no-store', // don't let the HTTP cache keep another 1.5 GB copy
    });

    if (res.status === 206) {
      const start = Number(res.headers.get('content-range')?.match(/^bytes (\d+)-/)?.[1] ?? NaN);
      if (start !== offset) throw new DownloadError(`Server resumed at ${start}, expected ${offset}`, true);
    } else if (res.status === 200) {
      // Server ignored the Range header: start this file from the beginning.
      offset = 0;
      sink.truncate(0);
      ctx.onBytes(0);
    } else if (res.status === 416) {
      sink.truncate(0); // our partial file doesn't match the server's; restart it
      ctx.onBytes(0);
      throw new DownloadError('Range not satisfiable', true);
    } else {
      throw new DownloadError(`HTTP ${res.status} for ${file.path}`, res.status >= 500 || res.status === 429);
    }
    if (!res.body) throw new DownloadError('Empty response body', true);

    const reader = res.body.getReader();
    let sinceFlush = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        ctx.signal?.throwIfAborted();
        if (offset + value.byteLength > file.size) throw new DownloadError(`${file.path} is larger than expected`, false);
        sink.write(value, offset);
        offset += value.byteLength;
        sinceFlush += value.byteLength;
        if (sinceFlush >= ctx.flushEvery) {
          sink.flush();
          sinceFlush = 0;
        }
        ctx.onBytes(offset);
      }
    } finally {
      sink.flush();
      reader.releaseLock();
    }
    if (offset !== file.size) throw new DownloadError(`Connection closed at ${offset} of ${file.size} bytes`, true);
  } finally {
    sink.close();
  }
}
