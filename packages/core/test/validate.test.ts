import { describe, expect, it } from 'vitest';
import type { ReceiptInput } from '../src/schemas';
import { validate } from '../src/validate';

const now = new Date('2026-10-31T12:00:00');

const receipt = (over: Partial<ReceiptInput> = {}): ReceiptInput => ({
  store: 'SPAR',
  date: '2026-10-30',
  currency: 'HUF',
  items: [
    { name: 'Bread', qty: 1, unit_price: 599, price: 599, category: 'groceries' },
    { name: 'Milk', qty: 2, unit_price: 400, price: 800, category: 'groceries' },
  ],
  total: 1399,
  ...over,
});

const codes = (r: ReceiptInput) => validate(r, { now }).warnings.map((w) => w.code);

describe('validate', () => {
  it('passes a consistent receipt', () => {
    const v = validate(receipt(), { now });
    expect(v).toMatchObject({ ok: true, items_sum: 1399, difference: 0, warnings: [] });
  });

  it('flags TOTAL_MISMATCH when |difference| >= 1', () => {
    expect(codes(receipt({ total: 1500 }))).toEqual(['TOTAL_MISMATCH']);
    expect(codes(receipt({ total: 1399.5 }))).toEqual([]);
  });

  it('flags ZERO_PRICE and QTY_PRICE_MISMATCH with the row index', () => {
    const v = validate(
      receipt({
        items: [
          { name: 'Free bag', qty: 1, price: 0, category: 'other' },
          { name: 'Milk', qty: 2, unit_price: 400, price: 700, category: 'groceries' },
        ],
        total: 700,
      }),
      { now },
    );
    expect(v.warnings.map((w) => [w.code, w.item_index])).toEqual([
      ['ZERO_PRICE', 0],
      ['QTY_PRICE_MISMATCH', 1],
    ]);
  });

  it('flags FUTURE_DATE, MISSING_DATE and UNKNOWN_CURRENCY', () => {
    expect(codes(receipt({ date: '2026-11-01' }))).toEqual(['FUTURE_DATE']);
    expect(codes(receipt({ date: '' }))).toEqual(['MISSING_DATE']);
    expect(codes(receipt({ currency: 'XXX' }))).toEqual(['UNKNOWN_CURRENCY']);
  });

  it('keeps extra warnings from post-processing', () => {
    const extra = [{ code: 'TAX_LOOKS_LIKE_RATE' as const, field: 'tax_amount', item_index: null, message: '' }];
    expect(validate(receipt(), { now, extra }).ok).toBe(false);
  });
});
