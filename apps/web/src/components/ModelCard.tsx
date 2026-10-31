/** Offline model: download / pause / resume (resumable), progress, memory test and delete. */
import { toUserMessage, type ModelProgress } from '@ghostledger/core';
import { useState } from 'react';
import { useApp } from '../lib/app-context';
import { formatBytes } from '../lib/files';
import { Avatar, Icon } from './Icon';

type Test = { state: 'idle' | 'loading' | 'ok' | 'error'; text?: string; percent?: number | null };

export function ModelCard() {
  const { local, download, modelReady } = useApp();
  const { status, running, progress, error } = download;
  const [test, setTest] = useState<Test>({ state: 'idle' });

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
      setTest({ state: 'ok', text: `Loaded in ${((performance.now() - started) / 1000).toFixed(0)} s` });
    } catch (err) {
      setTest({ state: 'error', text: toUserMessage(err) });
    }
  };

  return (
    <>
      <h2 className="day-title">Offline model</h2>
      <ul className="rows card">
        <li className="row">
          <Avatar name="phone" tone={modelReady ? 'mint' : 'neutral'} />
          <span className="row-text">
            <b>Gemma 4 E2B</b>
            <small>
              {runtime.device === 'wasm' ? 'No GPU support here, so it will be slow' : 'Runs on this phone’s GPU'} ·{' '}
              {runtime.dtype}
            </small>
          </span>
          <span className={modelReady ? 'yes' : 'muted'}>
            {modelReady ? 'Ready' : running ? `${percent.toFixed(0)}%` : status.state === 'partial' ? 'Paused' : 'Not downloaded'}
          </span>
        </li>

        {/* Downloading */}
        {!modelReady && running && (
          <li className="row stack">
            <progress max={100} value={preparing ? undefined : percent} />
            <span className="split">
              <small className="muted">
                {preparing ? 'Preparing…' : `${formatBytes(loaded)} of ${formatBytes(total)}`}
              </small>
              <button className="text-button" onClick={download.pause}>
                Pause
              </button>
            </span>
            {progress?.status === 'retrying' && (
              <small className="muted">
                Connection lost{progress.lastError ? ` (${progress.lastError})` : ''}. Retrying in{' '}
                {Math.round((progress.retryInMs ?? 0) / 1000)} s…
              </small>
            )}
            <small className="muted">
              Keep GhostLedger open; the screen stays on. If the app closes, the download continues from here.
            </small>
          </li>
        )}

        {/* Paused / interrupted */}
        {!modelReady && !running && status.state === 'partial' && (
          <>
            <li className="row stack">
              <progress max={100} value={percent} />
              <small className="muted">
                Paused at {formatBytes(status.loaded)} of {formatBytes(status.total)}
              </small>
            </li>
            <li>
              <button className="row" onClick={download.start}>
                <Avatar name="download" tone="mint" />
                <span className="row-text">
                  <b>Resume download</b>
                  <small>Continues where it stopped</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            </li>
            <li>
              <button className="row danger-text" onClick={() => confirm('Delete the partial download?') && download.remove()}>
                Delete partial download
              </button>
            </li>
          </>
        )}

        {/* Not downloaded */}
        {!modelReady && !running && status.state === 'none' && (
          <li>
            <button className="row" onClick={download.start}>
              <Avatar name="download" tone="mint" />
              <span className="row-text">
                <b>Download</b>
                <small>About 3 GB, once. Use Wi-Fi. Can be paused and resumed.</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </li>
        )}

        {/* Ready */}
        {modelReady && (
          <>
            <li>
              <button className="row" onClick={runTest} disabled={test.state === 'loading'}>
                <Avatar name="check" />
                <span className="row-text">
                  <b>Test: load into memory</b>
                  <small>
                    {test.state === 'loading'
                      ? `Loading${test.percent != null ? ` · ${test.percent.toFixed(0)}%` : '…'} If the app restarts now, the phone ran out of memory.`
                      : test.state === 'ok'
                        ? test.text
                        : 'Checks that this phone has enough memory'}
                  </small>
                </span>
              </button>
            </li>
            <li className="row">
              <span className="row-text">Size on this phone</span>
              <span className="muted">{formatBytes(status.total)}</span>
            </li>
            <li>
              <button
                className="row danger-text"
                onClick={() => confirm('Delete the offline model? Your receipts are kept.') && download.remove()}
              >
                Delete model
              </button>
            </li>
          </>
        )}
      </ul>
      {test.state === 'error' && <p className="error-text">{test.text}</p>}
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
