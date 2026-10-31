/**
 * Creates the on-device services once (ledger, providers, capabilities) and shares them with every screen.
 * Screens call @ghostledger/core directly; there is no backend.
 */
import {
  detectCapabilities,
  GeminiProvider,
  LocalProvider,
  type Capabilities,
  type Ledger,
  type Providers,
} from '@ghostledger/core';
import { createSqliteLedger } from '@ghostledger/core/ledger/sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSettings, saveSettings, type Settings } from './settings';

interface AppServices {
  ledger: Ledger;
  caps: Capabilities;
  local: LocalProvider;
  online: GeminiProvider;
  providers: Providers;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Whether the offline model is downloaded. Call refreshModelStatus() after download/delete. */
  modelReady: boolean;
  refreshModelStatus: () => Promise<void>;
}

const Ctx = createContext<AppServices | null>(null);

// One ledger worker for the whole app lifetime.
const ledger = createSqliteLedger();

export function AppProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    detectCapabilities().then(setCaps);
  }, []);

  const local = useMemo(
    () => (caps ? new LocalProvider({ webgpu: caps.webgpu, shaderF16: caps.shaderF16 }) : null),
    [caps],
  );

  const online = useMemo(
    () => new GeminiProvider({ apiKey: settings.geminiApiKey, baseUrl: settings.geminiProxyUrl || undefined }),
    [settings.geminiApiKey, settings.geminiProxyUrl],
  );

  const refreshModelStatus = useCallback(async () => {
    setModelReady(local ? await local.isDownloaded() : false);
  }, [local]);

  useEffect(() => {
    void refreshModelStatus();
  }, [refreshModelStatus]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  if (!caps || !local) return <div className="splash">Loading…</div>;

  const value: AppServices = {
    ledger,
    caps,
    local,
    online,
    providers: { offline: local, online },
    settings,
    updateSettings,
    modelReady,
    refreshModelStatus,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppServices {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
