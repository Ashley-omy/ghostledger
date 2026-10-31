/**
 * Offline (default) provider: Gemma 4 E2B on the device, in a Web Worker.
 * If the browser can't handle it, only this file changes: e.g. a Capacitor plugin
 * calling LiteRT-LM or llama.cpp (docs/ARCHITECTURE.md §10).
 */
import { AppError, type ErrorCode } from '../errors';
import type { ModelDtype } from '../model/files';
import { deleteModelFiles, getModelStatus, type ModelStatus } from '../model/opfs';
import type { FromWorker, LoadOptions, ModelProgress, ToWorker, WorkerRequest } from './local.protocol';
import type { Availability, GenerateOptions, LLMProvider } from './types';

export const LOCAL_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

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
  private downloading: Promise<void> | null = null;

  constructor(opts: LocalProviderOptions) {
    const modelId = opts.modelId ?? LOCAL_MODEL_ID;
    this.extractModel = this.insightModel = modelId;
    const dtype: ModelDtype = opts.webgpu && opts.shaderF16 ? 'q4f16' : 'q4';
    this.load = { modelId, device: opts.webgpu ? 'webgpu' : 'wasm', dtype };
  }

  get runtime(): LoadOptions {
    return this.load;
  }

  async available(): Promise<Availability> {
    if (!(await this.isDownloaded())) return { ok: false, reason: 'The offline model is not downloaded yet.' };
    return { ok: true, reason: null };
  }

  /** How much of the model is on disk (none / partial / complete). */
  status(): Promise<ModelStatus> {
    return getModelStatus(this.load.modelId, this.load.dtype);
  }

  async isDownloaded(): Promise<boolean> {
    return (await this.status()).state === 'complete';
  }

  /**
   * Starts or resumes the download. Safe to call again after a crash, reload or pause:
   * it continues from the last byte on disk. Concurrent calls share one download.
   */
  download(onProgress?: (p: ModelProgress) => void, signal?: AbortSignal): Promise<void> {
    this.downloading ??= this.call({ type: 'download', options: this.load }, { signal }, onProgress)
      .then(() => undefined)
      .finally(() => {
        this.downloading = null;
      });
    return this.downloading;
  }

  /** Loads the model into memory / GPU. Useful to test whether the phone has enough memory. */
  async warmUp(onProgress?: (p: ModelProgress) => void): Promise<void> {
    await this.call({ type: 'load', options: this.load }, {}, onProgress);
  }

  /** Deletes the model files. The ledger is not touched. */
  async deleteModel(): Promise<void> {
    this.worker?.terminate(); // releases OPFS file locks held by a running download
    this.worker = null;
    this.downloading = null;
    await deleteModelFiles(this.load.modelId);
  }

  async extract(image: Blob, prompt: string, opts?: GenerateOptions): Promise<string> {
    await this.ensureDownloaded();
    return this.call({ type: 'extract', options: this.load, image, prompt }, opts, this.loadStatus(opts));
  }

  async analyze(system: string, payload: object, opts?: GenerateOptions): Promise<string> {
    await this.ensureDownloaded();
    const user = `Spending data:\n${JSON.stringify(payload)}`;
    return this.call({ type: 'analyze', options: this.load, system, user }, opts, this.loadStatus(opts));
  }

  private loadStatus(opts?: GenerateOptions) {
    return (p: ModelProgress) =>
      opts?.onStatus?.(`Loading the model into memory…${p.percent != null ? ` ${p.percent.toFixed(0)}%` : ''}`);
  }

  private async ensureDownloaded() {
    if (!(await this.isDownloaded())) throw new AppError('MODEL_NOT_DOWNLOADED');
  }

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('./local.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  private call(msg: WorkerRequest, opts: GenerateOptions = {}, onProgress?: (p: ModelProgress) => void): Promise<string> {
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
          const code: ErrorCode = data.code;
          reject(new AppError(code, code === 'INTERNAL' ? `On-device model error: ${data.message}` : data.message));
        }
      };
      // The worker itself crashed (e.g. out of memory while loading the model).
      const onError = (e: ErrorEvent) => {
        cleanup();
        this.worker = null;
        reject(new AppError('INTERNAL', `The on-device model stopped unexpectedly${e.message ? `: ${e.message}` : ''}.`));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      if (opts.signal?.aborted) return onAbort();
      opts.signal?.addEventListener('abort', onAbort);
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ ...msg, id } as ToWorker);
    });
  }
}
