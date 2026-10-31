import { describe, expect, it } from 'vitest';
import { selectProvider } from '../src/providers/select';
import type { LLMProvider } from '../src/providers/types';

const provider = (mode: 'online' | 'offline', ok: boolean): LLMProvider => ({
  mode,
  extractModel: mode,
  insightModel: mode,
  destination: mode,
  available: async () => ({ ok, reason: ok ? null : `${mode} unavailable.` }),
  extract: async () => '',
  analyze: async () => '',
});

describe('selectProvider', () => {
  it('uses Offline by default', async () => {
    const s = await selectProvider({ offline: provider('offline', true), online: provider('online', true) });
    expect(s).toMatchObject({ provider: { mode: 'offline' }, fallback: false });
  });

  it('never falls back from Offline to Online on its own', async () => {
    await expect(
      selectProvider({ offline: provider('offline', false), online: provider('online', true) }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_DOWNLOADED' });
  });

  it('falls back from Online to Offline and says so', async () => {
    const s = await selectProvider({ offline: provider('offline', true), online: provider('online', false) }, 'online');
    expect(s).toMatchObject({ provider: { mode: 'offline' }, fallback: true });
  });

  it('fails when neither mode works', async () => {
    await expect(
      selectProvider({ offline: provider('offline', false), online: provider('online', false) }, 'online'),
    ).rejects.toMatchObject({ code: 'MODE_UNAVAILABLE' });
  });
});
