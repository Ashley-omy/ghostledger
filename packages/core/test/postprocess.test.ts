import { describe, expect, it } from 'vitest';
import { normalizeCurrency, normalizeDate, postProcess } from '../src/postprocess';
import type { RawReceipt } from '../src/schemas';

const now = new Date('2026-10-31T12:00:00');

const raw = (over: Partial<RawReceipt> = {}): RawReceipt => ({
  store: ' SPAR ',
  date: '2026.10.30',
  currency: 'Ft',
  items: [{ name: 'Kenyér', name_en: 'Bread', qty: null, unit_price: null, price: 599, category: 'groceries' }],
  total: 599,
  ...over,
});

describe('normalizeCurrency', () => {
  it.each([
    ['Ft', 'HUF'],
    ['HUF', 'HUF'],
    ['¥', 'JPY'],
    ['円', 'JPY'],
    ['€', 'EUR'],
    ['eur', 'EUR'],
    ['usd', 'USD'],
  ])('%s → %s', (input, expected) => expect(normalizeCurrency(input)).toBe(expected));

  it('returns null for unknown symbols', () => expect(normalizeCurrency('??')).toBeNull());
});

describe('normalizeDate', () => {
  it.each([
    ['2026-10-30', '2026-10-30'],
    ['2026.10.30', '2026-10-30'],
    ['2026/1/5', '2026-01-05'],
    ['2026年10月30日', '2026-10-30'],
    ['30.10.2026', '2026-10-30'],
    ['2026-02-30', null],
    ['yesterday', null],
  ])('%s → %s', (input, expected) => expect(normalizeDate(input)).toBe(expected));
});

describe('postProcess', () => {
  it('normalizes currency, date, qty, category and store', () => {
    const { draft, warnings } = postProcess(raw({ items: [{ name: 'X', price: 10, category: 'snacks' }], total: 10 }), { now });
    expect(draft).toMatchObject({ store: 'SPAR', date: '2026-10-30', currency: 'HUF', total: 10 });
    expect(draft.items[0]).toMatchObject({ qty: 1, unit_price: null, category: 'other' });
    expect(warnings).toEqual([]);
  });

  it('converts a tax rate into an amount and warns', () => {
    const { draft, warnings } = postProcess(raw({ tax_amount: 0.27, total: 1270 }), { now });
    expect(draft.tax_amount).toBe(270);
    expect(warnings.map((w) => w.code)).toEqual(['TAX_LOOKS_LIKE_RATE']);
  });

  it('sets a missing date to today and warns', () => {
    const { draft, warnings } = postProcess(raw({ date: null }), { now });
    expect(draft.date).toBe('2026-10-31');
    expect(warnings.map((w) => w.code)).toEqual(['MISSING_DATE']);
  });

  it('uses XXX for an unknown currency', () => {
    expect(postProcess(raw({ currency: '??' }), { now }).draft.currency).toBe('XXX');
  });
});
