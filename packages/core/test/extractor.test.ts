import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors';
import { extractReceipt, parseModelOutput } from '../src/extractor';
import { repairJson } from '../src/json';
import type { LLMProvider } from '../src/providers/types';

const GOOD = JSON.stringify({
  store: 'SPAR',
  date: '2026.10.30',
  currency: 'Ft',
  items: [{ name: 'Kenyér', name_en: 'Bread', qty: 1, unit_price: 599, price: 599, category: 'groceries' }],
  tax_amount: 0.27,
  total: 599,
});

function fakeProvider(outputs: string[]): LLMProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    mode: 'offline',
    extractModel: 'fake-e2b',
    insightModel: 'fake-e2b',
    destination: 'test',
    prompts,
    available: async () => ({ ok: true, reason: null }),
    extract: async (_img, prompt) => {
      prompts.push(prompt);
      return outputs.shift() ?? '';
    },
    analyze: async () => '',
  };
}

const image = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });

describe('repairJson', () => {
  it('handles code fences, chatter and trailing commas', () => {
    expect(repairJson('Sure! ```json\n{"a": [1, 2,],}\n``` Hope this helps')).toEqual({ a: [1, 2] });
  });
});

describe('parseModelOutput', () => {
  it('reports schema errors with paths', () => {
    const r = parseModelOutput('{"store":"x","items":[],"total":1}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('items');
  });
});

describe('extractReceipt', () => {
  it('post-processes and validates the model output', async () => {
    const provider = fakeProvider([`\`\`\`json\n${GOOD}\n\`\`\``]);
    const result = await extractReceipt(image, provider);
    expect(result.draft).toMatchObject({ currency: 'HUF', date: '2026-10-30', source_mode: 'offline' });
    expect(result.validation.warnings.map((w) => w.code)).toContain('TAX_LOOKS_LIKE_RATE');
    expect(result.meta).toMatchObject({ mode_used: 'offline', model: 'fake-e2b', fallback: false });
  });

  it('retries once with the validation error in the prompt', async () => {
    const provider = fakeProvider(['not json', GOOD]);
    await extractReceipt(image, provider);
    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toContain('Your previous answer was invalid');
  });

  it('fails with EXTRACTION_FAILED after the retry', async () => {
    const provider = fakeProvider(['nope', 'still nope']);
    await expect(extractReceipt(image, provider)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it('rejects files that are not images', async () => {
    const text = new Blob(['hi'], { type: 'text/plain' });
    await expect(extractReceipt(text, fakeProvider([GOOD]))).rejects.toBeInstanceOf(AppError);
  });
});
