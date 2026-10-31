/**
 * Data shapes. These mirror `components/schemas` in docs/openapi.yaml field-for-field.
 * docs/openapi.yaml stays the source of truth: change it first, then update this file.
 * TODO: generate this file from the spec (e.g. openapi-zod-client) instead of keeping it by hand.
 */
import { z } from 'zod';

export const Mode = z.enum(['online', 'offline']);
export type Mode = z.infer<typeof Mode>;

export const CATEGORIES = ['groceries', 'dining', 'transport', 'household', 'health', 'entertainment', 'other'] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const PaymentMethod = z.enum(['cash', 'card', 'mobile', 'other']).nullable();
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const Item = z.object({
  name: z.string(),
  name_en: z.string().nullable().optional(),
  qty: z.number().min(0).default(1),
  unit_price: z.number().min(0).nullable().optional(),
  price: z.number().min(0),
  category: Category,
});
export type Item = z.infer<typeof Item>;

export const ReceiptInput = z.object({
  store: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code'),
  payment_method: PaymentMethod.optional(),
  items: z.array(Item).min(1),
  tax_amount: z.number().min(0).nullable().optional(),
  total: z.number().min(0),
  source_mode: Mode.nullable().optional(),
});
export type ReceiptInput = z.infer<typeof ReceiptInput>;

/**
 * What the model is allowed to return. Looser than ReceiptInput: currency may be a symbol
 * ("Ft", "¥"), date may be missing and qty may be absent. postProcess() turns it into a ReceiptInput.
 */
export const RawReceipt = z.object({
  store: z.string().nullable().default(''),
  date: z.string().nullable().default(null),
  currency: z.string().nullable().default(null),
  payment_method: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        name_en: z.string().nullable().optional(),
        qty: z.number().nullable().optional(),
        unit_price: z.number().nullable().optional(),
        price: z.number(),
        category: z.string().nullable().optional(),
      }),
    )
    .min(1),
  tax_amount: z.number().nullable().optional(),
  total: z.number(),
});
export type RawReceipt = z.infer<typeof RawReceipt>;

export const Receipt = ReceiptInput.extend({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Receipt = z.infer<typeof Receipt>;

export const WARNING_CODES = [
  'TOTAL_MISMATCH',
  'ZERO_PRICE',
  'QTY_PRICE_MISMATCH',
  'MISSING_DATE',
  'FUTURE_DATE',
  'UNKNOWN_CURRENCY',
  'TAX_LOOKS_LIKE_RATE',
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface Warning {
  code: WarningCode;
  field: string | null;
  item_index: number | null;
  message: string;
}

export interface Validation {
  ok: boolean;
  items_sum: number;
  difference: number;
  warnings: Warning[];
}

export interface ModelMeta {
  mode_used: Mode;
  model: string;
  fallback: boolean;
  elapsed_ms: number;
}

export interface ExtractionResult {
  draft: ReceiptInput;
  validation: Validation;
  meta: ModelMeta;
}

export interface CategoryTotal {
  category: Category;
  currency: string;
  amount: number;
  /** Number of receipts with this category */
  count: number;
}

export interface Summary {
  month: string;
  receipt_count: number;
  currency_totals: Record<string, number>;
  by_category: CategoryTotal[];
}

export type Privacy = 'aggregates' | 'full';

export interface InsightRequest {
  month: string;
  mode?: Mode;
  privacy?: Privacy;
  language?: string;
}

export interface InsightPreview {
  mode: Mode;
  privacy: Privacy;
  destination: string;
  /** Exact JSON that will be sent to the model */
  payload: object;
}

export interface InsightResult {
  text: string;
  highlights?: { title: string; detail: string }[];
  meta: ModelMeta;
}
