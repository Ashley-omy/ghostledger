/// <reference lib="webworker" />
/**
 * Runs Gemma 4 E2B on the device with Transformers.js (WebGPU, WASM fallback).
 * Lives in a Web Worker so downloading and inference never block the UI.
 *
 * Downloading and loading are separate steps:
 *  1. download: resumable, streamed to OPFS (model/download.ts). Low memory, survives restarts.
 *  2. load: Transformers.js reads the files from OPFS through OpfsModelCache, with remote access off,
 *     so it works fully offline and never downloads anything itself.
 * API follows the onnx-community/gemma-4-E2B-it-ONNX model card.
 */
import {
  AutoProcessor,
  env,
  Gemma4ForConditionalGeneration,
  InterruptableStoppingCriteria,
  RawImage,
  TextStreamer,
} from '@huggingface/transformers';
import { DownloadError, downloadModel } from '../model/download';
import { fetchManifest, hubBlockingFetch } from '../model/files';
import { getModelStatus, OpfsModelCache, OpfsModelStore } from '../model/opfs';
import type { FromWorker, LoadOptions, ModelProgress, ToWorker } from './local.protocol';

declare const self: DedicatedWorkerGlobalScope;

// Transformers.js types are very generic here; keep `any` at this one boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { key: string; processor: any; model: any };
let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;
const stops = new Map<number, InterruptableStoppingCriteria>();
const aborts = new Map<number, AbortController>();

const post = (msg: FromWorker) => self.postMessage(msg);
// Captured before env.fetch is replaced; the downloader uses the real network.
const realFetch = globalThis.fetch.bind(globalThis);
const progress = (id: number, p: ModelProgress) => post({ type: 'progress', id, progress: p });

class WorkerError extends Error {
  constructor(
    readonly code: Extract<FromWorker, { type: 'error' }>['code'],
    message: string,
  ) {
    super(message);
  }
}

const GB = 1024 ** 3;

async function ensureSpace(bytesNeeded: number) {
  const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
  if (!quota) return;
  const free = quota - usage;
  // ~5 % headroom for the ledger, ONNX Runtime and the browser's own bookkeeping.
  if (free < bytesNeeded * 1.05) {
    throw new WorkerError(
      'DOWNLOAD_FAILED',
      `Not enough storage: the model needs ${(bytesNeeded / GB).toFixed(1)} GB, but only ${(free / GB).toFixed(1)} GB is available to this app.`,
    );
  }
}

async function download(id: number, opts: LoadOptions) {
  const ctrl = new AbortController();
  aborts.set(id, ctrl);
  try {
    await downloadModel(
      new OpfsModelStore(opts.modelId, opts.dtype),
      async () => {
        const manifest = await fetchManifest(opts.modelId, opts.dtype);
        await ensureSpace(manifest.totalBytes);
        return manifest;
      },
      {
        signal: ctrl.signal,
        onProgress: (p) => progress(id, { phase: 'download', ...p }),
      },
    );
  } catch (err) {
    if (err instanceof DownloadError) throw new WorkerError('DOWNLOAD_FAILED', err.message);
    if (err instanceof TypeError) {
      // fetchManifest failed: no connection while starting a fresh download
      throw new WorkerError('DOWNLOAD_FAILED', 'Could not reach Hugging Face. Check the connection and try again.');
    }
    throw err;
  } finally {
    aborts.delete(id);
  }
}

async function load(id: number, opts: LoadOptions): Promise<Loaded> {
  const key = `${opts.modelId}|${opts.device}|${opts.dtype}`;
  if (loaded?.key === key) return loaded;
  if (!loading) {
    loading = (async () => {
      const status = await getModelStatus(opts.modelId, opts.dtype);
      if (status.state !== 'complete') throw new WorkerError('MODEL_NOT_DOWNLOADED', 'Download the offline model in Settings first.');

      // Read model files only from OPFS; never download from inside Transformers.js.
      // Transformers.js rejects allowLocalModels=false + allowRemoteModels=false, so remote stays "on"
      // and env.fetch answers every Hub request with a local 404 (see hubBlockingFetch).
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.fetch = hubBlockingFetch(realFetch) as any;
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = new OpfsModelCache(opts.modelId, opts.dtype) as any;

      const progress_callback = (info: any) => {
        if (info.status !== 'progress_total') return;
        progress(id, {
          phase: 'load',
          status: 'loading',
          loaded: info.loaded ?? 0,
          total: info.total ?? 0,
          percent: typeof info.progress === 'number' ? info.progress : null,
          file: null,
        });
      };
      const processor = await AutoProcessor.from_pretrained(opts.modelId, { progress_callback });
      const model = await Gemma4ForConditionalGeneration.from_pretrained(opts.modelId, {
        dtype: opts.dtype,
        device: opts.device,
        progress_callback,
      });
      loaded = { key, processor, model };
      return loaded;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

async function generate(id: number, processor: any, model: any, inputs: any): Promise<string> {
  const stop = new InterruptableStoppingCriteria();
  stops.set(id, stop);
  try {
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: 1024,
      do_sample: false,
      stopping_criteria: [stop],
      streamer: new TextStreamer(processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => post({ type: 'token', id, text }),
      }),
    });
    const decoded = processor.batch_decode(outputs.slice(null, [inputs.input_ids.dims.at(-1), null]), {
      skip_special_tokens: true,
    });
    return decoded[0] ?? '';
  } finally {
    stops.delete(id);
  }
}

async function extract(id: number, opts: LoadOptions, image: Blob, prompt: string) {
  const { processor, model } = await load(id, opts);
  // Image before text, as recommended for Gemma (skill: llm-extraction).
  const messages = [{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: prompt }] }];
  const chat = processor.apply_chat_template(messages, { enable_thinking: false, add_generation_prompt: true });
  const raw = await RawImage.fromBlob(image);
  const inputs = await processor(chat, raw, null, { add_special_tokens: false });
  return generate(id, processor, model, inputs);
}

async function analyze(id: number, opts: LoadOptions, system: string, user: string) {
  const { processor, model } = await load(id, opts);
  const messages = [
    { role: 'system', content: [{ type: 'text', text: system }] },
    { role: 'user', content: [{ type: 'text', text: user }] },
  ];
  const chat = processor.apply_chat_template(messages, { enable_thinking: false, add_generation_prompt: true });
  // TODO(spike): confirm text-only input works through the processor; tokenizer-only is the fallback.
  const inputs = await processor(chat, null, null, { add_special_tokens: false });
  return generate(id, processor, model, inputs);
}

self.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  if (data.type === 'abort') {
    stops.get(data.id)?.interrupt();
    aborts.get(data.id)?.abort();
    return;
  }
  try {
    let text = '';
    if (data.type === 'download') await download(data.id, data.options);
    if (data.type === 'load') await load(data.id, data.options);
    if (data.type === 'extract') text = await extract(data.id, data.options, data.image, data.prompt);
    if (data.type === 'analyze') text = await analyze(data.id, data.options, data.system, data.user);
    post({ type: 'done', id: data.id, text });
  } catch (err) {
    const code = err instanceof WorkerError ? err.code : 'INTERNAL';
    post({ type: 'error', id: data.id, code, message: err instanceof Error ? err.message : String(err) });
  }
};
