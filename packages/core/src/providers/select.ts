/**
 * Mode selection (docs/ARCHITECTURE.md §7).
 * Offline is the default. We never switch to Online on our own, because the data would leave the device.
 */
import { AppError } from '../errors';
import type { Mode } from '../schemas';
import type { LLMProvider } from './types';

export interface Providers {
  offline: LLMProvider;
  online: LLMProvider;
}

export interface Selection {
  provider: LLMProvider;
  /** True when the user asked for Online but we had to use Offline. */
  fallback: boolean;
}

export async function selectProvider(providers: Providers, requested: Mode = 'offline'): Promise<Selection> {
  if (requested === 'online') {
    const online = await providers.online.available();
    if (online.ok) return { provider: providers.online, fallback: false };
    const offline = await providers.offline.available();
    if (offline.ok) return { provider: providers.offline, fallback: true };
    throw new AppError('MODE_UNAVAILABLE', `${online.reason} ${offline.reason}`);
  }

  const offline = await providers.offline.available();
  if (offline.ok) return { provider: providers.offline, fallback: false };
  // Offline → Online needs the user's consent, so report the reason and let the UI offer it.
  throw new AppError('MODEL_NOT_DOWNLOADED', offline.reason ?? undefined);
}
