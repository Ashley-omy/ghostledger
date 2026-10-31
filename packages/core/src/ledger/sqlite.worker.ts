/// <reference lib="webworker" />
/**
 * Owns the SQLite database. Stored in OPFS with the "opfs-sahpool" VFS, which works in a worker
 * without COOP/COEP headers (iOS Safari included). Falls back to an in-memory database when OPFS is missing.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { AppError } from '../errors';
import { LedgerStore } from './store';
import type { SqlDb } from './types';

declare const self: DedicatedWorkerGlobalScope;

const DB_FILE = '/ghostledger.sqlite3';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rpc = { id: number; method: string; args: unknown[] };

const ready = (async () => {
  const sqlite3: any = await sqlite3InitModule();
  let db: any;
  let persistent = true;
  let pool: any = null;
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'ghostledger' });
    db = new pool.OpfsSAHPoolDb(DB_FILE);
  } catch (err) {
    console.warn('[ledger] OPFS unavailable, using an in-memory database. Data will be lost on reload.', err);
    db = new sqlite3.oo1.DB(':memory:');
    persistent = false;
  }

  const adapter: SqlDb = {
    all: (sql, params) => db.exec({ sql, bind: params?.length ? params : undefined, rowMode: 'object', returnValue: 'resultRows' }),
    run: (sql, params) => {
      db.exec({ sql, bind: params?.length ? params : undefined });
      return { lastInsertRowid: Number(db.selectValue('SELECT last_insert_rowid()')), changes: db.changes() };
    },
    exec: (sql) => db.exec(sql),
  };

  const store = new LedgerStore(adapter);
  const exportDatabase = (): Uint8Array =>
    pool ? pool.exportFile(DB_FILE) : sqlite3.capi.sqlite3_js_db_export(db.pointer);

  return { store, persistent, exportDatabase };
})();

self.onmessage = async ({ data }: MessageEvent<Rpc>) => {
  try {
    const { store, persistent, exportDatabase } = await ready;
    let result: unknown;
    switch (data.method) {
      case 'persistent':
        result = persistent;
        break;
      case 'exportDatabase':
        result = exportDatabase();
        break;
      case 'list':
      case 'get':
      case 'create':
      case 'update':
      case 'remove':
        result = (store[data.method] as (...a: unknown[]) => unknown)(...data.args);
        break;
      default:
        throw new AppError('BAD_REQUEST', `Unknown ledger method ${data.method}`);
    }
    self.postMessage({ id: data.id, ok: true, result });
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'INTERNAL';
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ id: data.id, ok: false, code, message });
  }
};
