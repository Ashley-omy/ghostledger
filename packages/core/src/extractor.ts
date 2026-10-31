/**
 * Receipt image → draft + validation. Same pipeline for every provider (skill: llm-extraction):
 * downscale → model → repair JSON → Zod → retry once → post-process → validate.
 * The draft is not saved; the user reviews it first.
 */
import { AppError } from './errors';
import { checkImage, checkImageSize, downscale } from './image';
import { repairJson } from './json';
import { postProcess } from './postprocess';
import { EXTRACTION_PROMPT, retryPrompt } from './prompt';
import type { GenerateOptions, LLMProvider } from './providers/types';
import { RawReceipt, type ExtractionResult } from './schemas';
import { validate } from './validate';

export interface ExtractOptions extends GenerateOptions {
  /** Set by selectProvider() when the requested mode wasn't available. */
  fallback?: boolean;
  /** Long side in px before the image goes to the model. */
  maxSide?: number;
}

export function parseModelOutput(text: string): { ok: true; value: RawReceipt } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = repairJson(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Output is not JSON' };
  }
  const parsed = RawReceipt.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  };
}

export async function extractReceipt(
  image: Blob,
  provider: LLMProvider,
  opts: ExtractOptions = {},
): Promise<ExtractionResult> {
  checkImage(image);
  const started = performance.now();
  const small = await downscale(image, opts.maxSide ?? 1024);
  checkImageSize(small);

  let parsed = parseModelOutput(await provider.extract(small, EXTRACTION_PROMPT, opts));
  if (!parsed.ok) {
    parsed = parseModelOutput(await provider.extract(small, retryPrompt(parsed.error), opts));
  }
  if (!parsed.ok) throw new AppError('EXTRACTION_FAILED');

  const { draft, warnings } = postProcess(parsed.value);
  draft.source_mode = provider.mode;

  return {
    draft,
    validation: validate(draft, { extra: warnings }),
    meta: {
      mode_used: provider.mode,
      model: provider.extractModel,
      fallback: opts.fallback ?? false,
      elapsed_ms: Math.round(performance.now() - started),
    },
  };
}
