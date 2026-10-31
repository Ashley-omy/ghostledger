/** Offline model download, device capabilities, storage and Online mode settings. */
import { requestPersistentStorage, type Mode } from '@ghostledger/core';
import { useState } from 'react';
import { ModelCard } from '../components/ModelCard';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';

export function SettingsScreen() {
  const { caps, settings, updateSettings } = useApp();
  const [persisted, setPersisted] = useState(caps.storage?.persisted ?? false);

  return (
    <section>
      <h2>Settings</h2>

      <ModelCard />

      <div className="card">
        <h3>Default mode</h3>
        <select value={settings.defaultMode} onChange={(e) => updateSettings({ defaultMode: e.target.value as Mode })}>
          <option value="offline">Offline — on this phone (recommended)</option>
          <option value="online">Online — Gemini API</option>
        </select>
        <label>
          Insights language
          <input value={settings.language} onChange={(e) => updateSettings({ language: e.target.value })} />
        </label>
      </div>

      <div className="card">
        <h3>☁️ Online mode (optional)</h3>
        <label>
          Gemini API key
          <input
            type="password"
            autoComplete="off"
            placeholder="Stored only on this device"
            value={settings.geminiApiKey}
            onChange={(e) => updateSettings({ geminiApiKey: e.target.value.trim() })}
          />
        </label>
        <label>
          Proxy URL (optional)
          <input
            type="url"
            placeholder="https://… (leave empty to call Gemini directly)"
            value={settings.geminiProxyUrl}
            onChange={(e) => updateSettings({ geminiProxyUrl: e.target.value.trim() })}
          />
        </label>
      </div>

      <div className="card">
        <h3>This device</h3>
        <ul className="plain">
          <li>WebGPU: {caps.webgpu ? '✅' : '❌'} · shader-f16: {caps.shaderF16 ? '✅' : '❌'}</li>
          <li>OPFS (ledger storage): {caps.opfs ? '✅' : '❌'}</li>
          <li>
            Persistent storage: {persisted ? '✅' : '❌'}{' '}
            {!persisted && (
              <button className="link" onClick={async () => setPersisted(await requestPersistentStorage())}>
                Request
              </button>
            )}
          </li>
          {caps.storage && (
            <li>
              Storage used: {formatBytes(caps.storage.usage)} of {formatBytes(caps.storage.quota)}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
