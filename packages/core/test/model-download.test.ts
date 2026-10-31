import { describe, expect, it, vi } from 'vitest';
import { downloadModel, type FileSink, type ModelStore } from '../src/model/download';
import { hubBlockingFetch, repoPathFromKey, selectModelFiles, type HubTreeEntry, type ModelManifest } from '../src/model/files';

// ---------- files ----------

const TREE: HubTreeEntry[] = [
  { type: 'file', path: 'README.md', size: 5000 },
  { type: 'file', path: '.gitattributes', size: 100 },
  { type: 'file', path: 'config.json', size: 10 },
  { type: 'file', path: 'tokenizer.json', size: 1000 },
  { type: 'file', path: 'chat_template.jinja', size: 20 },
  { type: 'directory', path: 'onnx', size: 0 },
  { type: 'file', path: 'onnx/decoder_model_merged_q4f16.onnx', size: 700 },
  { type: 'file', path: 'onnx/decoder_model_merged_q4f16.onnx_data', size: 1, lfs: { size: 1_500_000 } },
  { type: 'file', path: 'onnx/decoder_model_merged_q4.onnx', size: 600 },
  { type: 'file', path: 'onnx/decoder_model_merged_q4.onnx_data', size: 1, lfs: { size: 1_800_000 } },
  { type: 'file', path: 'onnx/decoder_model_merged.onnx_data_3', size: 1, lfs: { size: 9_000_000 } },
  { type: 'file', path: 'onnx/embed_tokens_q4f16.onnx', size: 30 },
  { type: 'file', path: 'onnx/embed_tokens_q4f16.onnx_data', size: 1, lfs: { size: 1_600_000 } },
];

describe('selectModelFiles', () => {
  it('keeps root config files and only the requested dtype, smallest first', () => {
    expect(selectModelFiles(TREE, 'q4f16').map((f) => f.path)).toEqual([
      'config.json',
      'chat_template.jinja',
      'onnx/embed_tokens_q4f16.onnx',
      'onnx/decoder_model_merged_q4f16.onnx',
      'tokenizer.json',
      'onnx/decoder_model_merged_q4f16.onnx_data',
      'onnx/embed_tokens_q4f16.onnx_data',
    ]);
  });

  it('does not confuse q4 with q4f16 and uses LFS sizes', () => {
    const q4 = selectModelFiles(TREE, 'q4');
    expect(q4.map((f) => f.path).filter((p) => p.startsWith('onnx/'))).toEqual([
      'onnx/decoder_model_merged_q4.onnx',
      'onnx/decoder_model_merged_q4.onnx_data',
    ]);
    expect(q4.at(-1)?.size).toBe(1_800_000);
  });
});

describe('repoPathFromKey', () => {
  const id = 'onnx-community/gemma-4-E2B-it-ONNX';
  it.each([
    [`https://huggingface.co/${id}/resolve/main/onnx/a_q4f16.onnx`, 'onnx/a_q4f16.onnx'],
    [`https://huggingface.co/${id}/resolve/abc123/config.json`, 'config.json'],
    [`/models/${id}/tokenizer.json`, 'tokenizer.json'],
    ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1/dist/ort.wasm', null],
  ])('%s → %s', (key, expected) => expect(repoPathFromKey(key, id)).toBe(expected));
});

describe('hubBlockingFetch', () => {
  it('answers Hub requests with a local 404 and passes other URLs through', async () => {
    const seen: string[] = [];
    const real = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response('ok');
    }) as typeof fetch;
    const f = hubBlockingFetch(real);
    expect((await f('https://huggingface.co/org/m/resolve/main/special_tokens_map.json')).status).toBe(404);
    expect((await f(new URL('https://hf.co/org/m/resolve/main/x.json'))).status).toBe(404);
    expect(await (await f('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.wasm')).text()).toBe('ok');
    expect(seen).toEqual(['https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.wasm']);
  });
});

// ---------- resumable download ----------

class MemoryStore implements ModelStore {
  files = new Map<string, Uint8Array>();
  manifest: ModelManifest | null = null;
  async readManifest() {
    return this.manifest && structuredClone(this.manifest);
  }
  async writeManifest(m: ModelManifest) {
    this.manifest = structuredClone(m);
  }
  async open(path: string): Promise<FileSink> {
    const files = this.files;
    if (!files.has(path)) files.set(path, new Uint8Array(0));
    return {
      size: () => files.get(path)!.byteLength,
      truncate: (n) => files.set(path, files.get(path)!.slice(0, n)),
      write: (chunk, at) => {
        const cur = files.get(path)!;
        const next = new Uint8Array(Math.max(cur.byteLength, at + chunk.byteLength));
        next.set(cur);
        next.set(chunk, at);
        files.set(path, next);
      },
      flush: () => {},
      close: () => {},
    };
  }
}

const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 251);

const REMOTE: Record<string, Uint8Array> = {
  'config.json': bytes(10, 3),
  'onnx/model_q4f16.onnx_data': bytes(1000, 5),
};

const MANIFEST: ModelManifest = {
  modelId: 'org/model',
  dtype: 'q4f16',
  revision: 'abc',
  files: [
    { path: 'config.json', size: 10 },
    { path: 'onnx/model_q4f16.onnx_data', size: 1000 },
  ],
  totalBytes: 1010,
  complete: false,
};

interface ServerOptions {
  /** Drop the connection after sending this many bytes of the response (once). */
  cutAfter?: number;
  ignoreRange?: boolean;
  failFirst?: number;
}

function fakeServer(opts: ServerOptions = {}) {
  const requests: { path: string; range: string | null }[] = [];
  let cut = opts.cutAfter;
  let failures = opts.failFirst ?? 0;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const path = url.split('/resolve/abc/')[1]!;
    const range = (init?.headers as Record<string, string>)?.Range ?? null;
    requests.push({ path, range });
    if (failures > 0) {
      failures--;
      throw new TypeError('Failed to fetch');
    }
    const data = REMOTE[path]!;
    const start = range && !opts.ignoreRange ? Number(range.match(/bytes=(\d+)-/)![1]) : 0;
    let body = data.slice(start);
    let truncated = false;
    if (cut !== undefined && body.byteLength > cut) {
      body = body.slice(0, cut);
      truncated = true;
      cut = undefined;
    }
    let pos = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pos < body.byteLength) {
          c.enqueue(body.slice(pos, pos + 100));
          pos += 100;
        } else if (truncated) c.error(new TypeError('network connection was lost'));
        else c.close();
      },
    });
    const headers = new Headers({ 'content-length': String(data.byteLength - start) });
    if (start > 0) headers.set('content-range', `bytes ${start}-${data.byteLength - 1}/${data.byteLength}`);
    return new Response(stream, { status: start > 0 ? 206 : 200, headers });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const noSleep = async () => {};

describe('downloadModel', () => {
  it('downloads every file and marks the manifest complete', async () => {
    const store = new MemoryStore();
    const { fetchFn } = fakeServer();
    const m = await downloadModel(store, async () => structuredClone(MANIFEST), { fetch: fetchFn, sleep: noSleep });
    expect(m.complete).toBe(true);
    expect(store.files.get('onnx/model_q4f16.onnx_data')).toEqual(REMOTE['onnx/model_q4f16.onnx_data']);
  });

  it('resumes from the last byte after the connection drops', async () => {
    const store = new MemoryStore();
    const { fetchFn, requests } = fakeServer({ cutAfter: 400 });
    await downloadModel(store, async () => structuredClone(MANIFEST), { fetch: fetchFn, sleep: noSleep });
    expect(requests.filter((r) => r.path.endsWith('onnx_data')).map((r) => r.range)).toEqual([null, 'bytes=400-']);
    expect(store.files.get('onnx/model_q4f16.onnx_data')).toEqual(REMOTE['onnx/model_q4f16.onnx_data']);
  });

  it('resumes across app restarts (abort, then a new call with the stored manifest)', async () => {
    const store = new MemoryStore();
    const ctrl = new AbortController();
    const { fetchFn } = fakeServer();
    await expect(
      downloadModel(store, async () => structuredClone(MANIFEST), {
        fetch: fetchFn,
        sleep: noSleep,
        signal: ctrl.signal,
        progressIntervalMs: 0,
        onProgress: (p) => p.loaded >= 510 && ctrl.abort(),
      }),
    ).rejects.toThrow();
    expect(store.manifest?.complete).toBe(false);
    const partial = store.files.get('onnx/model_q4f16.onnx_data')!.byteLength;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1000);

    const second = fakeServer();
    let askedForManifest = false;
    await downloadModel(
      store,
      async () => {
        askedForManifest = true;
        return structuredClone(MANIFEST);
      },
      { fetch: second.fetchFn, sleep: noSleep },
    );
    expect(askedForManifest).toBe(false); // keeps the pinned revision
    expect(second.requests).toEqual([{ path: 'onnx/model_q4f16.onnx_data', range: `bytes=${partial}-` }]);
    expect(store.files.get('onnx/model_q4f16.onnx_data')).toEqual(REMOTE['onnx/model_q4f16.onnx_data']);
  });

  it('restarts a file when the server ignores Range', async () => {
    const store = new MemoryStore();
    await store.writeManifest(MANIFEST);
    (await store.open('onnx/model_q4f16.onnx_data')).write(bytes(300, 9), 0); // garbage partial
    const { fetchFn } = fakeServer({ ignoreRange: true });
    await downloadModel(store, async () => MANIFEST, { fetch: fetchFn, sleep: noSleep });
    expect(store.files.get('onnx/model_q4f16.onnx_data')).toEqual(REMOTE['onnx/model_q4f16.onnx_data']);
  });

  it('retries network errors with backoff, then gives up', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const ok = fakeServer({ failFirst: 3 });
    await downloadModel(new MemoryStore(), async () => structuredClone(MANIFEST), { fetch: ok.fetchFn, sleep });
    expect(waits).toEqual([1000, 2000, 4000]);

    const bad = fakeServer({ failFirst: 100 });
    await expect(
      downloadModel(new MemoryStore(), async () => structuredClone(MANIFEST), { fetch: bad.fetchFn, sleep: noSleep, maxRetries: 2 }),
    ).rejects.toThrow(/keeps failing/);
  });

  it('calls the global fetch with the right `this` (native fetch throws "Illegal invocation" otherwise)', async () => {
    const { fetchFn } = fakeServer();
    vi.stubGlobal('fetch', function (this: unknown, url: string, init?: RequestInit) {
      if (this !== globalThis && this !== undefined) throw new TypeError('Illegal invocation');
      return fetchFn(url, init);
    });
    try {
      const m = await downloadModel(new MemoryStore(), async () => structuredClone(MANIFEST), { sleep: noSleep, maxRetries: 0 });
      expect(m.complete).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
