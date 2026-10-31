/**
 * Offline (default) provider: Gemma 4 E2B on the device, in a Web Worker.
 * If the browser can't handle it, only this file changes: e.g. a Capacitor plugin
 * calling LiteRT-LM or llama.cpp (docs/ARCHITECTURE.md §10).
 */
import { AppError } from '../errors';
import type { DownloadProgress, FromWorker, LoadOptions, ToWorker, WorkerRequest } from './local.protocol';
import type { Availability, GenerateOptions, LLMProvider } from './types';

export const LOCAL_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const READY_KEY = 'ghostledger.localModelReady';
const TRANSFORMERS_CACHE = 'transformers-cache';

export interface LocalProviderOptions {
  modelId?: string;
  /** From detectCapabilities(): WebGPU with shader-f16 → q4f16; WebGPU without it → q4; no WebGPU → WASM. */
  webgpu: boolean;
  shaderF16: boolean;
}

export class LocalProvider implements LLMProvider {
  readonly mode = 'offline' as const;
  readonly extractModel: string;
  readonly insightModel: string;
  readonly destination = 'This device (Gemma 4 E2B). Nothing leaves your phone.';

  private worker: Worker | null = null;
  private nextId = 1;
  private readonly load: LoadOptions;

  constructor(opts: LocalProviderOptions) {
    const modelId = opts.modelId ?? LOCAL_MODEL_ID;
    this.extractModel = this.insightModel = modelId;
    this.load = {
      modelId,
      device: opts.webgpu ? 'webgpu' : 'wasm',
      dtype: opts.webgpu && opts.shaderF16 ? 'q4f16' : 'q4',
    };
  }

  get runtime(): LoadOptions {
    return this.load;
  }

  async available(): Promise<Availability> {
    if (!(await this.isDownloaded())) return { ok: false, reason: 'The offline model is not downloaded yet.' };
    return { ok: true, reason: null };
  }

  /** True when the model finished loading once and its files are still in the browser cache. */
  async isDownloaded(): Promise<boolean> {
    if (localStorage.getItem(READY_KEY) !== this.load.modelId) return false;
    try {
      const cache = await caches.open(TRANSFORMERS_CACHE);
      const keys = await cache.keys();
      return keys.some((req) => req.url.includes(this.load.modelId));
    } catch {
      return false;
    }
  }

  /** Downloads (or loads from cache) and warms up the model. Call from the Settings / onboarding screen. */
  async download(onProgress?: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
    await this.call({ type: 'load', options: this.load }, { signal }, onProgress);
    localStorage.setItem(READY_KEY, this.load.modelId);
  }

  /** Deletes the model files. The ledger is not touched. */
  async deleteModel(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    localStorage.removeItem(READY_KEY);
    const cache = await caches.open(TRANSFORMERS_CACHE);
    for (const req of await cache.keys()) {
      if (req.url.includes(this.load.modelId)) await cache.delete(req);
    }
  }

  async extract(image: Blob, prompt: string, opts?: GenerateOptions): Promise<string> {
    await this.ensureDownloaded();
    return this.call({ type: 'extract', options: this.load, image, prompt }, opts);
  }

  async analyze(system: string, payload: object, opts?: GenerateOptions): Promise<string> {
    await this.ensureDownloaded();
    const user = `Spending data:\n${JSON.stringify(payload)}`;
    return this.call({ type: 'analyze', options: this.load, system, user }, opts);
  }

  private async ensureDownloaded() {
    if (!(await this.isDownloaded())) throw new AppError('MODEL_NOT_DOWNLOADED');
  }

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('./local.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  private call(
    msg: WorkerRequest,
    opts: GenerateOptions = {},
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<string> {
    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        worker.postMessage({ type: 'abort', id } satisfies ToWorker);
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const onMessage = ({ data }: MessageEvent<FromWorker>) => {
        if (data.id !== id) return;
        if (data.type === 'progress') onProgress?.(data.progress);
        else if (data.type === 'token') opts.onToken?.(data.text);
        else if (data.type === 'done') {
          cleanup();
          resolve(data.text);
        } else if (data.type === 'error') {
          cleanup();
          reject(new AppError('INTERNAL', `On-device model error: ${data.message}`));
        }
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      if (opts.signal?.aborted) return onAbort();
      opts.signal?.addEventListener('abort', onAbort);
      worker.addEventListener('message', onMessage);
      worker.postMessage({ ...msg, id } as ToWorker);
    });
  }
}
