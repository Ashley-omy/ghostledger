/**
 * Ledger SQL. Runs synchronously next to the database (inside the SQLite worker in the browser,
 * or directly in tests). All money sums use items[].price (CLAUDE.md rules).
 */
import { AppError } from '../errors';
import { ReceiptInput, type Category, type Receipt } from '../schemas';
import type { ReceiptFilter, ReceiptList, SqlDb } from './types';

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    store          TEXT    NOT NULL,
    date           TEXT    NOT NULL,          -- YYYY-MM-DD
    currency       TEXT    NOT NULL,          -- ISO 4217
    payment_method TEXT,
    tax_amount     REAL,
    total          REAL    NOT NULL,
    source_mode    TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
  );
  CREATE INDEX receipts_date ON receipts(date);
  CREATE TABLE items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id  INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    name_en     TEXT,
    qty         REAL    NOT NULL DEFAULT 1,
    unit_price  REAL,
    price       REAL    NOT NULL,
    category    TEXT    NOT NULL
  );
  CREATE INDEX items_receipt ON items(receipt_id);
  CREATE INDEX items_category ON items(category);
  `,
];

interface ReceiptRow {
  id: number;
  store: string;
  date: string;
  currency: string;
  payment_method: string | null;
  tax_amount: number | null;
  total: number;
  source_mode: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  receipt_id: number;
  idx: number;
  name: string;
  name_en: string | null;
  qty: number;
  unit_price: number | null;
  price: number;
  category: string;
}

export class LedgerStore {
  constructor(private readonly db: SqlDb) {
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    const [row] = this.db.all<{ user_version: number }>('PRAGMA user_version');
    const version = Number(row?.user_version ?? 0);
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.tx(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  list(filter: ReceiptFilter = {}): ReceiptList {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.from) {
      where.push('r.date >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('r.date <= ?');
      params.push(filter.to);
    }
    if (filter.category) {
      where.push('EXISTS (SELECT 1 FROM items i WHERE i.receipt_id = r.id AND i.category = ?)');
      params.push(filter.category);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [count] = this.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM receipts r ${whereSql}`, params);
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 10_000);
    const offset = Math.max(filter.offset ?? 0, 0);
    const rows = this.db.all<ReceiptRow>(
      `SELECT r.* FROM receipts r ${whereSql} ORDER BY r.date DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { items: this.withItems(rows), total_count: Number(count?.n ?? 0) };
  }

  get(id: number): Receipt {
    const rows = this.db.all<ReceiptRow>('SELECT * FROM receipts WHERE id = ?', [id]);
    const receipt = this.withItems(rows)[0];
    if (!receipt) throw new AppError('NOT_FOUND', `Receipt ${id} not found.`);
    return receipt;
  }

  create(input: ReceiptInput): Receipt {
    const r = parseInput(input);
    const now = new Date().toISOString();
    const id = this.tx(() => {
      const { lastInsertRowid } = this.db.run(
        `INSERT INTO receipts (store, date, currency, payment_method, tax_amount, total, source_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.store, r.date, r.currency, r.payment_method ?? null, r.tax_amount ?? null, r.total, r.source_mode ?? null, now, now],
      );
      this.insertItems(Number(lastInsertRowid), r);
      return Number(lastInsertRowid);
    });
    return this.get(id);
  }

  update(id: number, input: ReceiptInput): Receipt {
    const r = parseInput(input);
    this.tx(() => {
      const { changes } = this.db.run(
        `UPDATE receipts SET store = ?, date = ?, currency = ?, payment_method = ?, tax_amount = ?, total = ?,
                source_mode = ?, updated_at = ? WHERE id = ?`,
        [r.store, r.date, r.currency, r.payment_method ?? null, r.tax_amount ?? null, r.total, r.source_mode ?? null,
          new Date().toISOString(), id],
      );
      if (!changes) throw new AppError('NOT_FOUND', `Receipt ${id} not found.`);
      this.db.run('DELETE FROM items WHERE receipt_id = ?', [id]);
      this.insertItems(id, r);
    });
    return this.get(id);
  }

  remove(id: number): void {
    const { changes } = this.db.run('DELETE FROM receipts WHERE id = ?', [id]);
    if (!changes) throw new AppError('NOT_FOUND', `Receipt ${id} not found.`);
  }

  private insertItems(receiptId: number, r: ReceiptInput) {
    r.items.forEach((it, idx) => {
      this.db.run(
        `INSERT INTO items (receipt_id, idx, name, name_en, qty, unit_price, price, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [receiptId, idx, it.name, it.name_en ?? null, it.qty, it.unit_price ?? null, it.price, it.category],
      );
    });
  }

  private withItems(rows: ReceiptRow[]): Receipt[] {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const items = this.db.all<ItemRow>(
      `SELECT * FROM items WHERE receipt_id IN (${ids.map(() => '?').join(',')}) ORDER BY receipt_id, idx`,
      ids,
    );
    const byReceipt = new Map<number, ItemRow[]>();
    for (const it of items) {
      const list = byReceipt.get(Number(it.receipt_id)) ?? [];
      list.push(it);
      byReceipt.set(Number(it.receipt_id), list);
    }
    return rows.map((r) => ({
      id: Number(r.id),
      store: r.store,
      date: r.date,
      currency: r.currency,
      payment_method: r.payment_method as Receipt['payment_method'],
      tax_amount: r.tax_amount,
      total: r.total,
      source_mode: r.source_mode as Receipt['source_mode'],
      created_at: r.created_at,
      updated_at: r.updated_at,
      items: (byReceipt.get(Number(r.id)) ?? []).map((it) => ({
        name: it.name,
        name_en: it.name_en,
        qty: it.qty,
        unit_price: it.unit_price,
        price: it.price,
        category: it.category as Category,
      })),
    }));
  }
}

function parseInput(input: ReceiptInput): ReceiptInput {
  const parsed = ReceiptInput.safeParse(input);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}
