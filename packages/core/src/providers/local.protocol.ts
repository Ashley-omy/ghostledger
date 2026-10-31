/** Messages between LocalProvider (main thread) and local.worker.ts. */

export interface LoadOptions {
  modelId: string;
  device: 'webgpu' | 'wasm';
  dtype: 'q4f16' | 'q4';
}

export type ToWorker =
  | { type: 'load'; id: number; options: LoadOptions }
  | { type: 'extract'; id: number; options: LoadOptions; image: Blob; prompt: string }
  | { type: 'analyze'; id: number; options: LoadOptions; system: string; user: string }
  | { type: 'abort'; id: number };

/** A request without its id (assigned by LocalProvider). Distributes over the union. */
export type WorkerRequest = ToWorker extends infer T
  ? T extends { type: 'load' | 'extract' | 'analyze' }
    ? Omit<T, 'id'>
    : never
  : never;

export interface DownloadProgress {
  /** 0–100 over all files, when known */
  percent: number | null;
  file?: string;
  status: string;
}

export type FromWorker =
  | { type: 'progress'; id: number; progress: DownloadProgress }
  | { type: 'token'; id: number; text: string }
  | { type: 'done'; id: number; text: string }
  | { type: 'error'; id: number; message: string };
