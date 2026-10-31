/** Offline model download, device capabilities, storage and Online mode settings. */
import { requestPersistentStorage, type Mode } from '@ghostledger/core';
import { useState } from 'react';
import { ModelCard } from '../components/ModelCard';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';

const YesNo = ({ ok }: { ok: boolean }) => <span className={ok ? 'yes' : 'muted'}>{ok ? 'Yes' : 'No'}</span>;

export function SettingsScreen() {
  const { caps, settings, updateSettings } = useApp();
  const [persisted, setPersisted] = useState(caps.storage?.persisted ?? false);

  return (
    <section>
      <h1>Settings</h1>

      <ModelCard />

      <h2 className="day-title">Preferences</h2>
      <ul className="rows card">
        <li>
          <label className="row">
            <span className="row-text">
              <b>Read receipts</b>
            </span>
            <select value={settings.defaultMode} onChange={(e) => updateSettings({ defaultMode: e.target.value as Mode })}>
              <option value="offline">On this phone</option>
              <option value="online">With Gemini</option>
            </select>
          </label>
        </li>
        <li>
          <label className="row">
            <span className="row-text">
              <b>Advice language</b>
            </span>
            <input value={settings.language} onChange={(e) => updateSettings({ language: e.target.value })} />
          </label>
        </li>
      </ul>

      <h2 className="day-title">Gemini (optional)</h2>
      <div className="card padded">
        <label className="field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="Stored only on this phone"
            value={settings.geminiApiKey}
            onChange={(e) => updateSettings({ geminiApiKey: e.target.value.trim() })}
          />
        </label>
        <label className="field">
          <span>Proxy URL</span>
          <input
            type="url"
            placeholder="Leave empty to call Gemini directly"
            value={settings.geminiProxyUrl}
            onChange={(e) => updateSettings({ geminiProxyUrl: e.target.value.trim() })}
          />
        </label>
      </div>

      <h2 className="day-title">This phone</h2>
      <ul className="rows card">
        <li className="row">
          <span className="row-text">GPU acceleration</span>
          <YesNo ok={caps.webgpu} />
        </li>
        <li className="row">
          <span className="row-text">Fast GPU math</span>
          <YesNo ok={caps.shaderF16} />
        </li>
        <li className="row">
          <span className="row-text">Ledger saved on this phone</span>
          <YesNo ok={caps.opfs} />
        </li>
        <li className="row">
          <span className="row-text">Protected from automatic cleanup</span>
          {persisted ? (
            <YesNo ok />
          ) : (
            <button className="link" onClick={async () => setPersisted(await requestPersistentStorage())}>
              Turn on
            </button>
          )}
        </li>
        {caps.storage && (
          <li className="row">
            <span className="row-text">Storage used</span>
            <span className="muted">
              {formatBytes(caps.storage.usage)} of {formatBytes(caps.storage.quota)}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
