/** Offline model download, device capabilities, storage and Online mode settings. */
import { requestPersistentStorage, toUserMessage, type DownloadProgress, type Mode } from '@ghostledger/core';
import { useRef, useState } from 'react';
import { Avatar, Icon } from '../components/Icon';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';

const YesNo = ({ ok }: { ok: boolean }) => <span className={ok ? 'yes' : 'muted'}>{ok ? 'Yes' : 'No'}</span>;

export function SettingsScreen() {
  const { caps, local, settings, updateSettings, modelReady, refreshModelStatus } = useApp();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [persisted, setPersisted] = useState(caps.storage?.persisted ?? false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const download = async () => {
    setError(null);
    setDownloading(true);
    abort.current = new AbortController();
    try {
      setPersisted(await requestPersistentStorage());
      await local.download((p) => setProgress((prev) => ({ ...p, percent: p.percent ?? prev?.percent ?? null })), abort.current.signal);
      await refreshModelStatus();
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') setError(toUserMessage(err));
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!confirm('Delete the offline model? Your receipts are kept.')) return;
    await local.deleteModel();
    await refreshModelStatus();
  };

  const { runtime } = local;

  return (
    <section>
      <h1>Settings</h1>

      <h2 className="day-title">Offline model</h2>
      <ul className="rows card">
        <li className="row">
          <Avatar name="phone" tone={modelReady ? 'mint' : 'neutral'} />
          <span className="row-text">
            <b>Gemma 4 E2B</b>
            <small>{runtime.device === 'wasm' ? 'No GPU support here, so it will be slow' : 'Runs on this phone’s GPU'}</small>
          </span>
          <span className={modelReady ? 'yes' : 'muted'}>{modelReady ? 'Ready' : 'Not downloaded'}</span>
        </li>
        {downloading ? (
          <li className="row stack">
            <progress max={100} value={progress?.percent ?? undefined} />
            <span className="split">
              <small className="muted">
                {progress?.percent != null ? `${progress.percent.toFixed(0)}%` : 'Starting…'} {progress?.file ?? ''}
              </small>
              <button className="text-button" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </span>
          </li>
        ) : modelReady ? (
          <li>
            <button className="row danger-text" onClick={remove}>
              Delete model
            </button>
          </li>
        ) : (
          <li>
            <button className="row" onClick={download}>
              <Avatar name="download" tone="mint" />
              <span className="row-text">
                <b>Download</b>
                <small>About 2–3 GB, once. Use Wi-Fi.</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </li>
        )}
      </ul>
      {error && <p className="error-text">{error}</p>}

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
