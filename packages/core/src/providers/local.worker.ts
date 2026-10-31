/// <reference lib="webworker" />
/**
 * Runs Gemma 4 E2B on the device with Transformers.js (WebGPU, WASM fallback).
 * Lives in a Web Worker so inference never blocks the UI.
 * API follows the onnx-community/gemma-4-E2B-it-ONNX model card.
 */
import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  InterruptableStoppingCriteria,
  RawImage,
  TextStreamer,
} from '@huggingface/transformers';
import type { FromWorker, LoadOptions, ToWorker } from './local.protocol';

declare const self: DedicatedWorkerGlobalScope;

// Transformers.js types are very generic here; keep `any` at this one boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { key: string; processor: any; model: any };
let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;
const stops = new Map<number, InterruptableStoppingCriteria>();

const post = (msg: FromWorker) => self.postMessage(msg);

async function load(id: number, opts: LoadOptions): Promise<Loaded> {
  const key = `${opts.modelId}|${opts.device}|${opts.dtype}`;
  if (loaded?.key === key) return loaded;
  if (!loading) {
    loading = (async () => {
      const progress_callback = (info: any) => {
        post({
          type: 'progress',
          id,
          progress: {
            status: String(info.status ?? ''),
            file: info.file,
            percent: info.status === 'progress_total' && typeof info.progress === 'number' ? info.progress : null,
          },
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
    return;
  }
  try {
    let text = '';
    if (data.type === 'load') await load(data.id, data.options);
    if (data.type === 'extract') text = await extract(data.id, data.options, data.image, data.prompt);
    if (data.type === 'analyze') text = await analyze(data.id, data.options, data.system, data.user);
    post({ type: 'done', id: data.id, text });
  } catch (err) {
    post({ type: 'error', id: data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
