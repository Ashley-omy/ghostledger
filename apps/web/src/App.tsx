import { useState } from 'react';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useApp } from './lib/app-context';
import { useOnline } from './lib/hooks';
import { InsightsScreen } from './screens/InsightsScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'scan' | 'ledger' | 'insights' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Scan', icon: '📸' },
  { id: 'ledger', label: 'Ledger', icon: '🧾' },
  { id: 'insights', label: 'Insights', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const online = useOnline();
  const { modelReady } = useApp();

  return (
    <div className="app">
      <header>
        <h1>👻 GhostLedger</h1>
        <span className={online ? 'pill' : 'pill offline'}>
          {online ? 'Online' : 'Offline'} · {modelReady ? 'model ready' : 'no model'}
        </span>
      </header>

      <main>
        {tab === 'scan' && <ScanScreen goToSettings={() => setTab('settings')} />}
        {tab === 'ledger' && <LedgerScreen />}
        {tab === 'insights' && <InsightsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav>
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <UpdatePrompt />
    </div>
  );
}
