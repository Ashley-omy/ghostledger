/**
 * Keeps the last chosen receipt photo in IndexedDB until the receipt is saved or discarded.
 * Phones may reload the page while the camera app is open or while the model reads a photo
 * (memory pressure); this lets the user retry without taking the photo again.
 */
import type { Mode } from '@ghostledger/core';

export interface PendingPhoto {
  blob: Blob;
  name: string;
  mode: Mode;
  savedAt: number;
}

const DB = 'ghostledger-ui';
const STORE = 'pending';
const KEY = 'photo';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function savePendingPhoto(file: File, mode: Mode): Promise<void> {
  // Copy the bytes: some Android pickers hand out files that become unreadable after a reload.
  const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' });
  const value: PendingPhoto = { blob, name: file.name, mode, savedAt: Date.now() };
  await tx('readwrite', (s) => s.put(value, KEY)).catch(() => undefined);
}

export async function loadPendingPhoto(): Promise<PendingPhoto | null> {
  try {
    return (await tx<PendingPhoto | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function clearPendingPhoto(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY)).catch(() => undefined);
}

export function pendingAsFile(p: PendingPhoto): File {
  return new File([p.blob], p.name || 'receipt.jpg', { type: p.blob.type || 'image/jpeg' });
}
