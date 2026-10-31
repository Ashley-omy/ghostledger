import type { Category, Receipt, ReceiptInput } from '../schemas';

export interface ReceiptFilter {
  /** YYYY-MM-DD, inclusive */
  from?: string;
  /** YYYY-MM-DD, inclusive */
  to?: string;
  /** Receipts that contain at least one item in this category */
  category?: Category;
  limit?: number;
  offset?: number;
}

export interface ReceiptList {
  items: Receipt[];
  total_count: number;
}

/** The ledger as the UI sees it (async, because the real one lives in a worker). */
export interface Ledger {
  list(filter?: ReceiptFilter): Promise<ReceiptList>;
  get(id: number): Promise<Receipt>;
  create(input: ReceiptInput): Promise<Receipt>;
  update(id: number, input: ReceiptInput): Promise<Receipt>;
  remove(id: number): Promise<void>;
  /** Whether data survives a reload (false when OPFS is unavailable and we fell back to memory). */
  persistent(): Promise<boolean>;
  /** Raw SQLite file, for backups. */
  exportDatabase(): Promise<Uint8Array>;
}

/** Minimal synchronous SQLite surface. Implemented for sqlite-wasm (browser) and node:sqlite (tests). */
export interface SqlDb {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { lastInsertRowid: number; changes: number };
  exec(sql: string): void;
}
