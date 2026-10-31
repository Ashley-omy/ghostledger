/**
 * Runs the real ledger SQL against Node's built-in SQLite (node:sqlite).
 * In the browser the same LedgerStore runs against sqlite-wasm in a worker.
 */
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { receiptsToCsv } from '../src/export';
import { buildPayload, monthRange, summarize } from '../src/insights';
import { LedgerStore } from '../src/ledger/store';
import type { SqlDb } from '../src/ledger/types';
import type { ReceiptInput } from '../src/schemas';

function nodeDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  return {
    all: (sql, params = []) => db.prepare(sql).all(...(params as never[])) as never,
    run: (sql, params = []) => {
      const r = db.prepare(sql).run(...(params as never[]));
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    exec: (sql) => db.exec(sql),
  };
}

const spar: ReceiptInput = {
  store: 'SPAR',
  date: '2026-10-30',
  currency: 'HUF',
  payment_method: 'card',
  items: [
    { name: 'Kenyér', name_en: 'Bread', qty: 1, unit_price: 599, price: 599, category: 'groceries' },
    { name: 'Kávé, "extra"', name_en: 'Coffee', qty: 1, unit_price: null, price: 1200, category: 'dining' },
  ],
  tax_amount: 382,
  total: 1799,
  source_mode: 'offline',
};

const cafe: ReceiptInput = {
  store: 'Café',
  date: '2026-10-12',
  currency: 'HUF',
  items: [{ name: 'Latte', qty: 1, price: 950, category: 'dining' }],
  total: 950,
};

describe('LedgerStore', () => {
  let store: LedgerStore;
  beforeEach(() => {
    store = new LedgerStore(nodeDb());
  });

  it('creates, reads, updates and deletes receipts with items', () => {
    const created = store.create(spar);
    expect(created).toMatchObject({ id: 1, store: 'SPAR', items: [{ name: 'Kenyér' }, { name: 'Kávé, "extra"' }] });

    const updated = store.update(created.id, { ...spar, store: 'SPAR Express', items: spar.items.slice(0, 1), total: 599 });
    expect(updated.store).toBe('SPAR Express');
    expect(updated.items).toHaveLength(1);

    store.remove(created.id);
    expect(() => store.get(created.id)).toThrow(/not found/);
  });

  it('filters by date range and category, newest first', () => {
    store.create(spar);
    store.create(cafe);
    store.create({ ...cafe, date: '2026-09-01' });

    const oct = store.list(monthRange('2026-10'));
    expect(oct.total_count).toBe(2);
    expect(oct.items.map((r) => r.date)).toEqual(['2026-10-30', '2026-10-12']);

    expect(store.list({ category: 'groceries' }).items.map((r) => r.store)).toEqual(['SPAR']);
  });

  it('rejects invalid input', () => {
    expect(() => store.create({ ...spar, currency: 'Ft' })).toThrow(/currency/);
  });

  it('summarizes, builds privacy payloads and exports CSV', () => {
    store.create(spar);
    store.create(cafe);
    const receipts = store.list(monthRange('2026-10')).items;

    const summary = summarize(receipts, '2026-10');
    expect(summary).toMatchObject({ receipt_count: 2, currency_totals: { HUF: 2749 } });
    expect(summary.by_category).toEqual([
      { category: 'dining', currency: 'HUF', amount: 2150, count: 2 },
      { category: 'groceries', currency: 'HUF', amount: 599, count: 1 },
    ]);

    expect(buildPayload('aggregates', summary, receipts)).toEqual({ summary });
    const full = buildPayload('full', summary, receipts) as { receipts: { items: { name: string }[] }[] };
    expect(full.receipts[0]?.items.map((i) => i.name)).toEqual(['Bread', 'Coffee']);

    const csv = receiptsToCsv(receipts).trim().split('\r\n');
    expect(csv).toHaveLength(4);
    expect(csv[2]).toContain('"Kávé, ""extra"""');
  });
});
