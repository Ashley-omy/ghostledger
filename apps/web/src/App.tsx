import type { Receipt } from '@ghostledger/core';
import { useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useApp } from './lib/app-context';
import { useOnline } from './lib/hooks';
import { InsightsScreen } from './screens/InsightsScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'scan' | 'ledger' | 'insights' | 'settings';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'ledger', label: 'Home', icon: 'receipt' },
  { id: 'scan', label: 'Add', icon: 'plus' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('ledger');
  // The receipt just saved on Scan: the Ledger opens on its month (not necessarily the current one).
  const [justSaved, setJustSaved] = useState<Receipt | null>(null);
  const online = useOnline();
  const { modelReady, settings } = useApp();

  // The badge shows the current mode (chosen on Add / Insights / Settings) and whether it can run right now.
  const badge =
    settings.defaultMode === 'online'
      ? { icon: 'cloud' as const, text: online ? 'Gemini' : 'Gemini · no internet', cls: 'chip' }
      : modelReady
        ? { icon: 'lock' as const, text: 'On this phone', cls: 'chip mint' }
        : { icon: 'alert' as const, text: 'On this phone · no model', cls: 'chip' };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">GhostLedger</span>
        <span className={badge.cls}>
          <Icon name={badge.icon} size={14} />
          {badge.text}
        </span>
      </header>

      <main>
        {tab === 'scan' && (
          <ScanScreen
            goToSettings={() => setTab('settings')}
            onSaved={(receipt) => {
              setJustSaved(receipt);
              setTab('ledger');
            }}
          />
        )}
        {tab === 'ledger' && <LedgerScreen justSaved={justSaved} onAdd={() => setTab('scan')} />}
        {tab === 'insights' && <InsightsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              setJustSaved(null);
              setTab(t.id);
            }}
          >
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        ))}
      </nav>

      <UpdatePrompt />
    </div>
  );
}
