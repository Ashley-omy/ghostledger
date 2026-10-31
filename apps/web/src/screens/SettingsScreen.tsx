/** Offline model download, device capabilities, storage and Online mode settings. */
import { requestPersistentStorage, toUserMessage, type DownloadProgress, type Mode } from '@ghostledger/core';
import { useRef, useState } from 'react';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';

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
      <h2>Settings</h2>

      <div className="card">
        <h3>📴 Offline model</h3>
        <p>
          Gemma 4 E2B · <code>{runtime.dtype}</code> on <code>{runtime.device}</code>
          {runtime.device === 'wasm' && ' (no WebGPU — this will be slow)'}
        </p>
        <p>Status: {modelReady ? '✅ Ready offline' : 'Not downloaded'}</p>
        {downloading ? (
          <>
            <progress max={100} value={progress?.percent ?? undefined} />
            <p className="muted">
              {progress?.percent != null ? `${progress.percent.toFixed(0)}%` : 'Starting…'} {progress?.file ?? ''}
            </p>
            <button className="secondary" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </>
        ) : modelReady ? (
          <button className="danger" onClick={remove}>
            Delete model
          </button>
        ) : (
          <>
            <p className="muted">Download is a few GB. Use Wi-Fi. You only need to do this once.</p>
            <button onClick={download}>Download offline model</button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

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
