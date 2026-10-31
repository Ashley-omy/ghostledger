/**
 * Model files in the Origin Private File System (OPFS):
 *   models/<modelId with "/" → "--">/<dtype>/manifest.json
 *   models/<…>/<dtype>/onnx/decoder_model_merged_q4f16.onnx_data, …
 *
 * - OpfsModelStore writes with sync access handles, so it must run in a worker.
 * - getModelStatus / deleteModelFiles work on the main thread too.
 * - OpfsModelCache lets Transformers.js load the model straight from these files.
 */
import type { FileSink, ModelStore } from './download';
import { repoPathFromKey, type ModelDtype, type ModelManifest } from './files';

const ROOT = 'models';
const MANIFEST = 'manifest.json';
/** Transformers.js' default cache, still used for non-model files (ONNX Runtime .wasm). */
const FALLBACK_CACHE = 'transformers-cache';

const dirName = (modelId: string) => modelId.replace(/\//g, '--');

async function modelDir(modelId: string, dtype: ModelDtype, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const models = await root.getDirectoryHandle(ROOT, { create });
  const model = await models.getDirectoryHandle(dirName(modelId), { create });
  return model.getDirectoryHandle(dtype, { create });
}

async function fileHandle(dir: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = path.split('/');
  const name = parts.pop()!;
  let d = dir;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d.getFileHandle(name, { create });
}

async function readManifestFrom(dir: FileSystemDirectoryHandle): Promise<ModelManifest | null> {
  try {
    const file = await (await dir.getFileHandle(MANIFEST)).getFile();
    return JSON.parse(await file.text()) as ModelManifest;
  } catch {
    return null;
  }
}

/** Worker-only: FileSystemSyncAccessHandle is not available on the main thread. */
export class OpfsModelStore implements ModelStore {
  private dir: Promise<FileSystemDirectoryHandle>;

  constructor(modelId: string, dtype: ModelDtype) {
    this.dir = modelDir(modelId, dtype, true);
  }

  async readManifest() {
    return readManifestFrom(await this.dir);
  }

  async writeManifest(manifest: ModelManifest) {
    const sink = await this.open(MANIFEST);
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(manifest));
      sink.truncate(0);
      sink.write(bytes, 0);
      sink.flush();
    } finally {
      sink.close();
    }
  }

  async open(path: string): Promise<FileSink> {
    const handle = await (await fileHandle(await this.dir, path, true)).createSyncAccessHandle();
    return {
      size: () => handle.getSize(),
      truncate: (n) => handle.truncate(n),
      write: (chunk, at) => {
        const written = handle.write(chunk, { at });
        if (written !== chunk.byteLength) throw new Error('Short write: is the device out of storage?');
      },
      flush: () => handle.flush(),
      close: () => handle.close(),
    };
  }
}

export interface ModelStatus {
  state: 'none' | 'partial' | 'complete';
  loaded: number;
  total: number;
}

/** How much of the model is on disk. Safe to call from the main thread (not during a download). */
export async function getModelStatus(modelId: string, dtype: ModelDtype): Promise<ModelStatus> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await modelDir(modelId, dtype, false);
  } catch {
    return { state: 'none', loaded: 0, total: 0 };
  }
  const m = await readManifestFrom(dir);
  if (!m) return { state: 'none', loaded: 0, total: 0 };

  let loaded = 0;
  for (const f of m.files) {
    try {
      loaded += Math.min(f.size, (await (await fileHandle(dir, f.path, false)).getFile()).size);
    } catch {
      /* missing, or locked by a running download */
    }
  }
  const complete = m.complete && loaded === m.totalBytes;
  return { state: complete ? 'complete' : loaded > 0 || m.files.length ? 'partial' : 'none', loaded, total: m.totalBytes };
}

/** Deletes every downloaded file of this model (all dtypes). Stop the download worker first. */
export async function deleteModelFiles(modelId: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const models = await root.getDirectoryHandle(ROOT);
    await models.removeEntry(dirName(modelId), { recursive: true });
  } catch {
    /* nothing to delete */
  }
  // Older builds let Transformers.js cache the model in the Cache API; clean that up too.
  try {
    const cache = await caches.open(FALLBACK_CACHE);
    for (const req of await cache.keys()) if (req.url.includes(modelId)) await cache.delete(req);
  } catch {
    /* Cache API unavailable */
  }
}

/**
 * `env.customCache` for Transformers.js. Model files come only from OPFS (written by downloadModel),
 * everything else (ONNX Runtime .wasm) goes to the regular Cache API.
 */
export class OpfsModelCache {
  private manifest: Promise<ModelManifest | null> | null = null;

  constructor(
    private readonly modelId: string,
    private readonly dtype: ModelDtype,
  ) {}

  async match(key: string): Promise<Response | undefined> {
    const path = repoPathFromKey(key, this.modelId);
    if (path === null) return (await caches.open(FALLBACK_CACHE)).match(key);

    const dir = await modelDir(this.modelId, this.dtype, false).catch(() => null);
    if (!dir) return undefined;
    this.manifest ??= readManifestFrom(dir);
    const m = await this.manifest;
    if (!m?.complete || !m.files.some((f) => f.path === path)) return undefined;

    // A File is backed by disk; bytes are read only when Transformers.js consumes the body.
    const file = await (await fileHandle(dir, path, false)).getFile();
    return new Response(file, {
      headers: { 'content-length': String(file.size), 'content-type': 'application/octet-stream' },
    });
  }

  async put(key: string, response: Response): Promise<void> {
    // Model files are written only by downloadModel(), never half-way by Transformers.js.
    if (repoPathFromKey(key, this.modelId) !== null) return;
    await (await caches.open(FALLBACK_CACHE)).put(key, response);
  }
}
