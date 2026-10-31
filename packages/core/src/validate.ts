/**
 * Checks a receipt and returns warnings the review screen highlights (item_index + field).
 * Runs after extraction and again on every edit, so it must be pure and fast.
 */
import { round2, todayIso, UNKNOWN_CURRENCY_CODE } from './postprocess';
import type { ReceiptInput, Validation, Warning } from './schemas';

/** Same threshold as docs/API.md: |difference| ≥ 1 in the receipt's currency. */
const TOLERANCE = 1;

export function itemsSum(receipt: Pick<ReceiptInput, 'items'>): number {
  return round2(receipt.items.reduce((sum, it) => sum + it.price, 0));
}

export function validate(receipt: ReceiptInput, opts: { now?: Date; extra?: Warning[] } = {}): Validation {
  const warnings: Warning[] = [...(opts.extra ?? [])];
  const has = (code: Warning['code']) => warnings.some((w) => w.code === code);

  const items_sum = itemsSum(receipt);
  const difference = round2(items_sum - receipt.total);

  if (Math.abs(difference) >= TOLERANCE) {
    warnings.push({
      code: 'TOTAL_MISMATCH',
      field: 'total',
      item_index: null,
      message: `Items add up to ${items_sum}, but the total is ${receipt.total} (difference ${difference}).`,
    });
  }

  receipt.items.forEach((it, i) => {
    if (it.price === 0) {
      warnings.push({ code: 'ZERO_PRICE', field: 'price', item_index: i, message: `"${it.name}" has a price of 0.` });
    }
    if (it.unit_price != null && Math.abs(it.qty * it.unit_price - it.price) >= TOLERANCE) {
      warnings.push({
        code: 'QTY_PRICE_MISMATCH',
        field: 'qty',
        item_index: i,
        message: `${it.qty} × ${it.unit_price} ≠ ${it.price}. The line price is used for totals.`,
      });
    }
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)) {
    if (!has('MISSING_DATE')) {
      warnings.push({ code: 'MISSING_DATE', field: 'date', item_index: null, message: 'The date is missing.' });
    }
  } else if (receipt.date > todayIso(opts.now)) {
    warnings.push({ code: 'FUTURE_DATE', field: 'date', item_index: null, message: 'The date is in the future.' });
  }

  if (receipt.currency === UNKNOWN_CURRENCY_CODE) {
    warnings.push({
      code: 'UNKNOWN_CURRENCY',
      field: 'currency',
      item_index: null,
      message: "The currency couldn't be recognized. Please choose it.",
    });
  }

  return { ok: warnings.length === 0, items_sum, difference, warnings };
}
