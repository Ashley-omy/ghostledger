/** Offline model: download / pause / resume, progress, memory test and delete. */
import { toUserMessage, type ModelProgress } from '@ghostledger/core';
import { useState } from 'react';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';

export function ModelCard() {
  const { local, download, modelReady } = useApp();
  const { status, running, progress, error } = download;
  const [test, setTest] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; text?: string; percent?: number | null }>({
    state: 'idle',
  });

  const { runtime } = local;
  const total = progress?.total || status.total;
  const loaded = progress?.loaded ?? status.loaded;
  const percent = total ? (loaded / total) * 100 : 0;
  const preparing = !total || progress?.status === 'preparing';

  const runTest = async () => {
    setTest({ state: 'loading', percent: null });
    const started = performance.now();
    try {
      await local.warmUp((p: ModelProgress) => setTest({ state: 'loading', percent: p.percent }));
      setTest({ state: 'ok', text: `Loaded in ${((performance.now() - started) / 1000).toFixed(0)} s.` });
    } catch (err) {
      setTest({ state: 'error', text: toUserMessage(err) });
    }
  };

  return (
    <div className="card">
      <h3>📴 Offline model</h3>
      <p>
        Gemma 4 E2B · <code>{runtime.dtype}</code> on <code>{runtime.device}</code>
        {runtime.device === 'wasm' && ' (no WebGPU — this will be slow)'}
      </p>

      {modelReady && (
        <>
          <p>✅ Ready offline · {formatBytes(status.total)}</p>
          <div className="actions">
            <button className="secondary" onClick={runTest} disabled={test.state === 'loading'}>
              Test: load into memory
            </button>
            <button
              className="danger"
              onClick={() => confirm('Delete the offline model? Your receipts are kept.') && download.remove()}
            >
              Delete model
            </button>
          </div>
          {test.state === 'loading' && (
            <>
              <progress max={100} value={test.percent ?? undefined} />
              <p className="muted">
                Loading the model into memory{test.percent != null ? ` · ${test.percent.toFixed(0)}%` : '…'} If the app
                restarts during this step, the phone doesn't have enough memory for the model. The download is kept.
              </p>
            </>
          )}
          {test.state === 'ok' && <p className="success">✅ {test.text}</p>}
          {test.state === 'error' && <p className="error">{test.text}</p>}
        </>
      )}

      {!modelReady && running && (
        <>
          <progress max={100} value={preparing ? undefined : percent} />
          <p>
            {preparing
              ? 'Preparing…'
              : `${formatBytes(loaded)} of ${formatBytes(total)} · ${percent.toFixed(0)}%`}
          </p>
          {progress?.status === 'retrying' && (
            <p className="muted">
              Download interrupted{progress.lastError ? ` (${progress.lastError})` : ''}. Retrying in{' '}
              {Math.round((progress.retryInMs ?? 0) / 1000)} s…
            </p>
          )}
          <p className="muted">
            Keep GhostLedger open. The screen stays on while downloading. If the app closes, the download continues
            from {formatBytes(loaded)} when you open it again.
          </p>
          <button className="secondary" onClick={download.pause}>
            Pause
          </button>
        </>
      )}

      {!modelReady && !running && status.state === 'partial' && (
        <>
          <progress max={100} value={percent} />
          <p>
            Paused at {formatBytes(status.loaded)} of {formatBytes(status.total)} · {percent.toFixed(0)}%
          </p>
          <div className="actions">
            <button className="danger" onClick={() => confirm('Delete the partial download?') && download.remove()}>
              Delete
            </button>
            <button onClick={download.start}>Resume download</button>
          </div>
        </>
      )}

      {!modelReady && !running && status.state === 'none' && (
        <>
          <p className="muted">
            About 3.4 GB. Use Wi-Fi. The download can be paused and continues where it stopped, even after the app
            closes.
          </p>
          <button onClick={download.start}>Download offline model</button>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
