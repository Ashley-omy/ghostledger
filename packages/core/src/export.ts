/** CSV export, one row per item (same shape as the old GET /export.csv). Works offline. */
import type { Receipt } from './schemas';

export const CSV_COLUMNS = [
  'receipt_id',
  'date',
  'store',
  'currency',
  'payment_method',
  'item_index',
  'name',
  'name_en',
  'qty',
  'unit_price',
  'price',
  'category',
  'receipt_total',
  'tax_amount',
  'source_mode',
] as const;

function cell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function receiptsToCsv(receipts: Receipt[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of receipts) {
    r.items.forEach((it, i) => {
      lines.push(
        [
          r.id, r.date, r.store, r.currency, r.payment_method, i, it.name, it.name_en, it.qty, it.unit_price, it.price,
          it.category, r.total, r.tax_amount, r.source_mode,
        ]
          .map(cell)
          .join(','),
      );
    });
  }
  return lines.join('\r\n') + '\r\n';
}

/** UTF-8 with BOM so Excel opens non-Latin item names correctly. */
export function csvBlob(receipts: Receipt[]): Blob {
  return new Blob(['﻿', receiptsToCsv(receipts)], { type: 'text/csv;charset=utf-8' });
}
