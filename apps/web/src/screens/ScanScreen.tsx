/** Scan → review → save (docs/ARCHITECTURE.md §6.2). Offline by default. */
import {
  AppError,
  extractReceipt,
  selectProvider,
  toUserMessage,
  type ExtractionResult,
  type LLMProvider,
  type Mode,
  type Receipt,
} from '@ghostledger/core';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from '../components/Icon';
import { emptyReceipt, ReviewForm } from '../components/ReviewForm';
import { useApp } from '../lib/app-context';
import { useOnline } from '../lib/hooks';
import { clearPendingPhoto, loadPendingPhoto, pendingAsFile, savePendingPhoto, type PendingPhoto } from '../lib/pending-photo';

type State =
  | { step: 'idle' }
  | { step: 'working'; provider: LLMProvider; preview: string; status: string | null; startedAt: number }
  | { step: 'review'; result: ExtractionResult | null }
  | { step: 'error'; error: unknown; photo: File };

interface Props {
  goToSettings: () => void;
  /** Called after a receipt is saved, so the app can show it in the ledger. */
  onSaved: (receipt: Receipt) => void;
}

const percentOf = (loaded: number, total: number) => (total ? ((loaded / total) * 100).toFixed(0) : '0');

export function ScanScreen({ goToSettings, onSaved }: Props) {
  const { ledger, providers, settings, updateSettings, modelReady, download } = useApp();
  const isOnline = useOnline();
  // One app-wide mode, saved in Settings, so the choice sticks across tabs and shows in the header.
  const mode = settings.defaultMode;
  const setMode = (m: Mode) => updateSettings({ defaultMode: m });
  const [state, setState] = useState<State>({ step: 'idle' });
  const abort = useRef<AbortController | null>(null);
  // A photo from before a page reload (camera app open, or the phone ran out of memory mid-scan).
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadPendingPhoto().then(setPending);
  }, []);

  useEffect(() => {
    if (!pending) return setPendingUrl(null);
    const url = URL.createObjectURL(pending.blob);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const discardPending = () => {
    setPending(null);
    void clearPendingPhoto();
  };

  const run = async (photo: File, requested: Mode) => {
    abort.current = new AbortController();
    try {
      const { provider, fallback } = await selectProvider(providers, requested);
      setState({ step: 'working', provider, preview: '', status: null, startedAt: Date.now() });
      const result = await extractReceipt(photo, provider, {
        fallback,
        signal: abort.current.signal,
        onToken: (t) => setState((s) => (s.step === 'working' ? { ...s, status: null, preview: s.preview + t } : s)),
        onStatus: (status) => setState((s) => (s.step === 'working' ? { ...s, status } : s)),
      });
      setState({ step: 'review', result });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') setState({ step: 'idle' });
      else setState({ step: 'error', error, photo });
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const photo = e.target.files?.[0];
    e.target.value = '';
    if (!photo) return;
    setPending(null); // hide the "read it again" notice while this photo is processed
    await savePendingPhoto(photo, mode);
    void run(photo, mode);
  };

  if (state.step === 'review') {
    return (
      <section>
        <h1>{state.result ? 'Check your receipt' : 'New receipt'}</h1>
        <ReviewForm
          initial={state.result?.draft ?? emptyReceipt()}
          extraWarnings={state.result?.validation.warnings.filter((w) => w.code === 'TAX_LOOKS_LIKE_RATE' || w.code === 'MISSING_DATE')}
          meta={state.result?.meta}
          saveLabel="Save receipt"
          onCancel={() => {
            void clearPendingPhoto();
            setState({ step: 'idle' });
          }}
          onSave={async (receipt) => {
            const saved = await ledger.create(receipt);
            void clearPendingPhoto();
            onSaved(saved);
          }}
        />
      </section>
    );
  }

  if (state.step === 'working') {
    return (
      <section className="working">
        <div className="spinner" aria-hidden />
        <h1>Reading your receipt</h1>
        <p className="muted">
          {state.status ??
            `${state.provider.mode === 'offline' ? 'On this phone' : 'With Gemini'}. This can take up to a minute.`}
        </p>
        {state.preview && <pre className="stream">{state.preview}</pre>}
        <button className="chip-button" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      </section>
    );
  }

  const modelHint = download.running
    ? {
        title: 'Downloading the offline model',
        detail: download.progress?.total
          ? `${percentOf(download.progress.loaded, download.progress.total)}% · you can keep using the app`
          : 'Preparing…',
        action: goToSettings,
      }
    : download.status.state === 'partial'
      ? {
          title: 'Offline model download paused',
          detail: `At ${percentOf(download.status.loaded, download.status.total)}% · tap to resume`,
          action: download.start,
        }
      : { title: 'Download the offline model', detail: 'Once, about 3 GB. Use Wi-Fi.', action: goToSettings };

  return (
    <section>
      <h1>Add a receipt</h1>

      <div className="segmented" role="radiogroup" aria-label="Where the receipt is read">
        <button role="radio" aria-checked={mode === 'offline'} onClick={() => setMode('offline')}>
          On this phone
        </button>
        <button role="radio" aria-checked={mode === 'online'} onClick={() => setMode('online')} disabled={!isOnline}>
          Gemini
        </button>
      </div>

      {pending && pendingUrl && (
        <div className="notice warn">
          <img className="thumb" src={pendingUrl} alt="Last receipt photo" />
          <div>
            <p>Your last photo wasn't finished.</p>
            <div className="detail-actions">
              <button
                className="chip-button primary"
                onClick={() => {
                  const p = pending;
                  setPending(null);
                  void run(pendingAsFile(p), mode);
                }}
              >
                Read it again
              </button>
              <button className="chip-button" onClick={discardPending}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tiles">
        <label className="tile primary wide">
          <Icon name="camera" size={28} />
          <b>Scan receipt</b>
          <small>{mode === 'offline' ? 'The photo stays on this phone' : 'The photo is sent to Gemini'}</small>
          {/* capture opens the camera directly */}
          <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        </label>
        <label className="tile">
          <Icon name="image" size={28} />
          <b>From gallery</b>
          <small>A photo you already took</small>
          {/* no capture attribute: the phone offers its photo library / files */}
          <input type="file" accept="image/*" hidden onChange={onPhoto} />
        </label>
        <button className="tile" onClick={() => setState({ step: 'review', result: null })}>
          <Icon name="pencil" size={28} />
          <b>Type it in</b>
          <small>For cash or lost receipts</small>
        </button>
      </div>

      {!modelReady && mode === 'offline' && (
        <ul className="rows card">
          <li>
            <button className="row" onClick={modelHint.action}>
              <Avatar name="download" tone="mint" />
              <span className="row-text">
                <b>{modelHint.title}</b>
                <small>{modelHint.detail}</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </li>
        </ul>
      )}

      {state.step === 'error' && (
        <div className="notice warn">
          <Avatar name="alert" tone="warn" />
          <div>
            <p>{toUserMessage(state.error)}</p>
            {state.error instanceof AppError && state.error.code === 'MODEL_NOT_DOWNLOADED' ? (
              <div className="detail-actions">
                <button className="chip-button primary" onClick={goToSettings}>
                  Open Settings
                </button>
                {isOnline && settings.geminiApiKey && (
                  <button className="chip-button" onClick={() => run(state.photo, 'online')}>
                    Use Gemini once
                  </button>
                )}
              </div>
            ) : !(state.error instanceof AppError && state.error.code === 'INVALID_IMAGE') ? (
              <div className="detail-actions">
                <button className="chip-button primary" onClick={() => run(state.photo, mode)}>
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
