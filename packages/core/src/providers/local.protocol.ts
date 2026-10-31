/** Messages between LocalProvider (main thread) and local.worker.ts. */
import type { ModelDtype } from '../model/files';

export interface LoadOptions {
  modelId: string;
  device: 'webgpu' | 'wasm';
  dtype: ModelDtype;
}

export type ToWorker =
  | { type: 'download'; id: number; options: LoadOptions }
  | { type: 'load'; id: number; options: LoadOptions }
  | { type: 'extract'; id: number; options: LoadOptions; image: Blob; prompt: string }
  | { type: 'analyze'; id: number; options: LoadOptions; system: string; user: string }
  | { type: 'abort'; id: number };

/** A request without its id (assigned by LocalProvider). Distributes over the union. */
export type WorkerRequest = ToWorker extends infer T
  ? T extends { type: 'download' | 'load' | 'extract' | 'analyze' }
    ? Omit<T, 'id'>
    : never
  : never;

export interface ModelProgress {
  /** download = resumable download to OPFS; load = reading the model into memory / GPU */
  phase: 'download' | 'load';
  status: string;
  loaded: number;
  total: number;
  /** 0–100, when known */
  percent: number | null;
  file: string | null;
  /** Set while the download waits to retry after a network error */
  retryInMs?: number;
  lastError?: string;
}

export type FromWorker =
  | { type: 'progress'; id: number; progress: ModelProgress }
  | { type: 'token'; id: number; text: string }
  | { type: 'done'; id: number; text: string }
  | { type: 'error'; id: number; code: 'DOWNLOAD_FAILED' | 'MODEL_NOT_DOWNLOADED' | 'INTERNAL'; message: string };
