import type { Mode } from '@ghostledger/core';

export interface Settings {
  /** Offline is the default (docs/ARCHITECTURE.md §7). */
  defaultMode: Mode;
  /** Option A: the user's own Gemini key. Stays on this device. */
  geminiApiKey: string;
  /** Option B: our thin proxy that adds the key server-side. Empty = call Gemini directly. */
  geminiProxyUrl: string;
  /** Language of generated insights */
  language: string;
}

const KEY = 'ghostledger.settings';

export const DEFAULT_SETTINGS: Settings = {
  defaultMode: 'offline',
  geminiApiKey: '',
  geminiProxyUrl: '',
  language: 'English',
};

// TODO: move to IndexedDB (docs/ARCHITECTURE.md §8). localStorage is fine for the skeleton.
export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
