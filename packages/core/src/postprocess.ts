/**
 * Never trust the model for arithmetic or formats (skill: llm-extraction).
 * Turns whatever the model returned (RawReceipt) into a clean ReceiptInput,
 * plus warnings that only post-processing can detect.
 */
import { CATEGORIES, type Category, type PaymentMethod, type RawReceipt, type ReceiptInput, type Warning } from './schemas';

/** ISO 4217 "no currency" code, used when we can't tell the currency. validate() flags it. */
export const UNKNOWN_CURRENCY_CODE = 'XXX';

const CURRENCY_SYMBOLS: Record<string, string> = {
  ft: 'HUF',
  'ft.': 'HUF',
  forint: 'HUF',
  '¥': 'JPY',
  '円': 'JPY',
  '€': 'EUR',
  eur: 'EUR',
  '£': 'GBP',
  '$': 'USD',
  'us$': 'USD',
  'zł': 'PLN',
  'kč': 'CZK',
  '₩': 'KRW',
  '₹': 'INR',
  'lei': 'RON',
  'chf': 'CHF',
};

export function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Z]{3}$/.test(v)) return v;
  if (/^[a-z]{3}$/i.test(v) && !(v.toLowerCase() in CURRENCY_SYMBOLS)) return v.toUpperCase();
  return CURRENCY_SYMBOLS[v.toLowerCase()] ?? null;
}

/** Accepts 2026-10-30, 2026.10.30, 2026/10/30, 2026年10月30日, 30.10.2026. Returns YYYY-MM-DD or null. */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  let y: number, m: number, d: number;

  const ymd = v.match(/^(\d{4})\D{1,2}(\d{1,2})\D{1,2}(\d{1,2})/);
  const dmy = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function normalizeCategory(value: string | null | undefined): Category {
  const v = value?.trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(v ?? '') ? (v as Category) : 'other';
}

function normalizePayment(value: string | null | undefined): PaymentMethod {
  const v = value?.trim().toLowerCase();
  return v === 'cash' || v === 'card' || v === 'mobile' || v === 'other' ? v : null;
}

export interface PostProcessResult {
  draft: ReceiptInput;
  /** Warnings only post-processing can know about (e.g. the original tax value looked like a rate). */
  warnings: Warning[];
}

export function postProcess(raw: RawReceipt, opts: { now?: Date } = {}): PostProcessResult {
  const warnings: Warning[] = [];

  const items = raw.items.map((it) => ({
    name: it.name.trim(),
    name_en: it.name_en?.trim() || null,
    qty: it.qty != null && it.qty > 0 ? it.qty : 1,
    unit_price: it.unit_price != null && it.unit_price >= 0 ? it.unit_price : null,
    price: round2(Math.max(0, it.price)),
    category: normalizeCategory(it.category),
  }));

  const total = round2(Math.max(0, raw.total));

  let tax_amount = raw.tax_amount ?? null;
  if (tax_amount != null && tax_amount > 0 && tax_amount < 1) {
    const rate = tax_amount;
    tax_amount = round2((total * rate) / (1 + rate));
    warnings.push({
      code: 'TAX_LOOKS_LIKE_RATE',
      field: 'tax_amount',
      item_index: null,
      message: `The model returned a tax rate (${rate * 100}%). It was converted to an amount (${tax_amount}). Please check it.`,
    });
  } else if (tax_amount != null && tax_amount < 0) {
    tax_amount = null;
  }

  let date = normalizeDate(raw.date);
  if (!date) {
    date = todayIso(opts.now);
    warnings.push({
      code: 'MISSING_DATE',
      field: 'date',
      item_index: null,
      message: "The date couldn't be read, so it was set to today. Please check it.",
    });
  }

  const draft: ReceiptInput = {
    store: (raw.store ?? '').trim(),
    date,
    currency: normalizeCurrency(raw.currency) ?? UNKNOWN_CURRENCY_CODE,
    payment_method: normalizePayment(raw.payment_method),
    items,
    tax_amount,
    total,
    source_mode: null,
  };

  return { draft, warnings };
}
