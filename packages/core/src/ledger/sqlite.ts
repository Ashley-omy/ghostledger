/**
 * Browser ledger: a thin async client for sqlite.worker.ts.
 * Imported separately (`@ghostledger/core/ledger/sqlite`) so tests and Node never load sqlite-wasm.
 */
import { AppError, type ErrorCode } from '../errors';
import type { Ledger } from './types';

type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; code: ErrorCode; message: string };

export function createSqliteLedger(): Ledger {
  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  let nextId = 1;

  worker.addEventListener('message', ({ data }: MessageEvent<Reply>) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.ok) p.resolve(data.result);
    else p.reject(new AppError(data.code, data.message));
  });

  const call = <T>(method: keyof Ledger, ...args: unknown[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, method, args });
    });

  return {
    list: (filter) => call('list', filter),
    get: (id) => call('get', id),
    create: (input) => call('create', input),
    update: (id, input) => call('update', id, input),
    remove: (id) => call('remove', id),
    persistent: () => call('persistent'),
    exportDatabase: () => call('exportDatabase'),
  };
}
