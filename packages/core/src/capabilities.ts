/** What this device can do. Replaces GET /health (docs/ARCHITECTURE.md §4). */

export interface Capabilities {
  webgpu: boolean;
  /** Needed for the faster q4f16 model build */
  shaderF16: boolean;
  opfs: boolean;
  online: boolean;
  storage: { usage: number; quota: number; persisted: boolean } | null;
}

export async function detectCapabilities(): Promise<Capabilities> {
  let webgpu = false;
  let shaderF16 = false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      webgpu = !!adapter;
      shaderF16 = !!adapter?.features.has('shader-f16');
    } catch {
      /* no adapter */
    }
  }

  const opfs = typeof navigator.storage?.getDirectory === 'function';

  let storage: Capabilities['storage'] = null;
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    storage = { usage, quota, persisted };
  }

  return { webgpu, shaderF16, opfs, online: navigator.onLine, storage };
}

/** Ask the browser not to evict the model and the ledger. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
