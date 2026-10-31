/** Scan → review → save (docs/ARCHITECTURE.md §6.2). Offline by default. */
import {
  AppError,
  extractReceipt,
  selectProvider,
  toUserMessage,
  type ExtractionResult,
  type LLMProvider,
  type Mode,
} from '@ghostledger/core';
import { useEffect, useRef, useState } from 'react';
import { emptyReceipt, ReviewForm } from '../components/ReviewForm';
import { useApp } from '../lib/app-context';
import { useOnline } from '../lib/hooks';
import { clearPendingPhoto, loadPendingPhoto, pendingAsFile, savePendingPhoto, type PendingPhoto } from '../lib/pending-photo';

type State =
  | { step: 'idle' }
  | { step: 'working'; provider: LLMProvider; preview: string; status: string | null; startedAt: number }
  | { step: 'review'; result: ExtractionResult | null }
  | { step: 'error'; error: unknown; photo: File };

export function ScanScreen({ goToSettings }: { goToSettings: () => void }) {
  const { ledger, providers, settings, modelReady, download } = useApp();
  const isOnline = useOnline();
  const [mode, setMode] = useState<Mode>(settings.defaultMode);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
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
    setSavedMsg(null);
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
    setPending(null); // hide the "retry" card while this photo is processed
    await savePendingPhoto(photo, mode);
    void run(photo, mode);
  };

  if (state.step === 'review') {
    return (
      <section>
        <h2>Review</h2>
        <ReviewForm
          initial={state.result?.draft ?? emptyReceipt()}
          extraWarnings={state.result?.validation.warnings.filter((w) => w.code === 'TAX_LOOKS_LIKE_RATE' || w.code === 'MISSING_DATE')}
          meta={state.result?.meta}
          onCancel={() => {
            void clearPendingPhoto();
            setState({ step: 'idle' });
          }}
          onSave={async (receipt) => {
            const saved = await ledger.create(receipt);
            void clearPendingPhoto();
            setSavedMsg(`Saved receipt #${saved.id} from ${saved.store || 'unknown store'}.`);
            setState({ step: 'idle' });
          }}
        />
      </section>
    );
  }

  return (
    <section>
      <h2>Scan a receipt</h2>

      {!modelReady && (
        <div className="banner">
          {download.running ? (
            <>
              Downloading the offline model
              {download.progress?.total ? ` · ${((download.progress.loaded / download.progress.total) * 100).toFixed(0)}%` : '…'}{' '}
              <button className="link" onClick={goToSettings}>
                Details
              </button>
            </>
          ) : download.status.state === 'partial' ? (
            <>
              The offline model download is paused at{' '}
              {download.status.total ? ((download.status.loaded / download.status.total) * 100).toFixed(0) : 0}%.{' '}
              <button className="link" onClick={download.start}>
                Resume
              </button>
            </>
          ) : (
            <>
              The offline model isn't downloaded yet.{' '}
              <button className="link" onClick={goToSettings}>
                Download it in Settings
              </button>{' '}
              (Wi-Fi recommended), or enter receipts manually.
            </>
          )}
        </div>
      )}

      <div className="segmented" role="radiogroup" aria-label="Mode">
        <button aria-pressed={mode === 'offline'} onClick={() => setMode('offline')}>
          📴 Offline · on this phone
        </button>
        <button aria-pressed={mode === 'online'} onClick={() => setMode('online')} disabled={!isOnline}>
          ☁️ Online · Gemini
        </button>
      </div>
      {mode === 'online' && <p className="muted">The photo will be sent to the Gemini API.</p>}

      {state.step === 'working' ? (
        <div className="working">
          <div className="spinner" aria-hidden />
          <p>
            {state.status ?? (
              <>
                Reading the receipt with <b>{state.provider.extractModel}</b>… This can take a minute on a phone.
              </>
            )}
          </p>
          {state.preview && <pre className="stream">{state.preview}</pre>}
          <button className="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {pending && pendingUrl && (
            <div className="card pending">
              <img src={pendingUrl} alt="Last receipt photo" />
              <div>
                <p>Your last photo wasn't finished.</p>
                <div className="actions">
                  <button className="secondary" onClick={discardPending}>
                    Discard
                  </button>
                  <button
                    onClick={() => {
                      const p = pending;
                      setPending(null);
                      void run(pendingAsFile(p), mode);
                    }}
                  >
                    Read it again
                  </button>
                </div>
              </div>
            </div>
          )}
          <label className="button big">
            📸 Take a photo
            {/* capture opens the camera directly */}
            <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
          </label>
          <label className="button big secondary">
            🖼️ Choose from gallery
            {/* no capture attribute: the phone offers its photo library / files */}
            <input type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
          <button className="secondary" onClick={() => setState({ step: 'review', result: null })}>
            ✍️ Enter manually
          </button>
        </>
      )}

      {savedMsg && <p className="success">{savedMsg}</p>}

      {state.step === 'error' && (
        <div className="error">
          <p>{toUserMessage(state.error)}</p>
          {!(state.error instanceof AppError && ['MODEL_NOT_DOWNLOADED', 'INVALID_IMAGE'].includes(state.error.code)) && (
            <div className="actions">
              <button className="secondary" onClick={() => run(state.photo, mode)}>
                Try again
              </button>
            </div>
          )}
          {state.error instanceof AppError && state.error.code === 'MODEL_NOT_DOWNLOADED' && (
            <div className="actions">
              <button onClick={goToSettings}>Open Settings</button>
              {isOnline && settings.geminiApiKey && (
                <button className="secondary" onClick={() => run(state.photo, 'online')}>
                  Use Online once
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
