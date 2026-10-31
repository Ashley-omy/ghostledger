/**
 * Monthly summary and insights with a privacy preview.
 * The payload is built, shown and sent by the same code on the device, so what the user
 * confirms is exactly what leaves the phone. That replaces the old payload_hash / 409 check.
 */
import { round2 } from './postprocess';
import { insightPrompt } from './prompt';
import type { Ledger } from './ledger/types';
import type { GenerateOptions, LLMProvider } from './providers/types';
import type { CategoryTotal, InsightPreview, InsightResult, Privacy, Receipt, Summary } from './schemas';
import { itemsSum } from './validate';

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function summarize(receipts: Receipt[], month: string): Summary {
  const currency_totals: Record<string, number> = {};
  const byKey = new Map<string, CategoryTotal & { receiptIds: Set<number> }>();

  for (const r of receipts) {
    currency_totals[r.currency] = round2((currency_totals[r.currency] ?? 0) + itemsSum(r));
    for (const it of r.items) {
      const key = `${it.category}|${r.currency}`;
      const entry = byKey.get(key) ?? { category: it.category, currency: r.currency, amount: 0, count: 0, receiptIds: new Set() };
      entry.amount = round2(entry.amount + it.price);
      entry.receiptIds.add(r.id);
      entry.count = entry.receiptIds.size;
      byKey.set(key, entry);
    }
  }

  const by_category = [...byKey.values()]
    .map(({ receiptIds: _ids, ...rest }) => rest)
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount);

  return { month, receipt_count: receipts.length, currency_totals, by_category };
}

export async function loadMonth(ledger: Ledger, month: string): Promise<Receipt[]> {
  const { items } = await ledger.list({ ...monthRange(month), limit: 10_000 });
  return items;
}

/** `aggregates` sends only the Summary. `full` adds every item. Images are never sent. */
export function buildPayload(privacy: Privacy, summary: Summary, receipts: Receipt[]): object {
  if (privacy === 'aggregates') return { summary };
  return {
    summary,
    receipts: receipts.map((r) => ({
      date: r.date,
      store: r.store,
      currency: r.currency,
      payment_method: r.payment_method ?? null,
      total: r.total,
      items: r.items.map((it) => ({ name: it.name_en || it.name, qty: it.qty, price: it.price, category: it.category })),
    })),
  };
}

export async function previewInsights(
  ledger: Ledger,
  provider: LLMProvider,
  req: { month: string; privacy?: Privacy },
): Promise<InsightPreview> {
  const privacy = req.privacy ?? 'aggregates';
  const receipts = await loadMonth(ledger, req.month);
  return {
    mode: provider.mode,
    privacy,
    destination: provider.destination,
    payload: buildPayload(privacy, summarize(receipts, req.month), receipts),
  };
}

/** Sends exactly `preview.payload`. Call only after the user confirmed the preview. */
export async function generateInsights(
  preview: InsightPreview,
  provider: LLMProvider,
  opts: GenerateOptions & { language?: string; fallback?: boolean } = {},
): Promise<InsightResult> {
  const started = performance.now();
  const text = await provider.analyze(insightPrompt(opts.language ?? 'English'), preview.payload, opts);
  return {
    text,
    meta: {
      mode_used: provider.mode,
      model: provider.insightModel,
      fallback: opts.fallback ?? false,
      elapsed_ms: Math.round(performance.now() - started),
    },
  };
}
