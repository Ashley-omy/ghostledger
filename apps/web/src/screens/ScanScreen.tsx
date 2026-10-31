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
import { useRef, useState } from 'react';
import { Avatar, Icon } from '../components/Icon';
import { emptyReceipt, ReviewForm } from '../components/ReviewForm';
import { useApp } from '../lib/app-context';
import { useOnline } from '../lib/hooks';

type State =
  | { step: 'idle' }
  | { step: 'working'; provider: LLMProvider; preview: string; startedAt: number }
  | { step: 'review'; result: ExtractionResult | null }
  | { step: 'error'; error: unknown; photo: File };

interface Props {
  goToSettings: () => void;
  /** Called after a receipt is saved, so the app can show it in the ledger. */
  onSaved: (receipt: Receipt) => void;
}

export function ScanScreen({ goToSettings, onSaved }: Props) {
  const { ledger, providers, settings, updateSettings, modelReady } = useApp();
  const isOnline = useOnline();
  // One app-wide mode, saved in Settings, so the choice sticks across tabs and shows in the header.
  const mode = settings.defaultMode;
  const setMode = (m: Mode) => updateSettings({ defaultMode: m });
  const [state, setState] = useState<State>({ step: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const run = async (photo: File, requested: Mode) => {
    abort.current = new AbortController();
    try {
      const { provider, fallback } = await selectProvider(providers, requested);
      setState({ step: 'working', provider, preview: '', startedAt: Date.now() });
      const result = await extractReceipt(photo, provider, {
        fallback,
        signal: abort.current.signal,
        onToken: (t) => setState((s) => (s.step === 'working' ? { ...s, preview: s.preview + t } : s)),
      });
      setState({ step: 'review', result });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') setState({ step: 'idle' });
      else setState({ step: 'error', error, photo });
    }
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const photo = e.target.files?.[0];
    e.target.value = '';
    if (photo) void run(photo, mode);
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
          onCancel={() => setState({ step: 'idle' })}
          onSave={async (receipt) => {
            onSaved(await ledger.create(receipt));
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
          {state.provider.mode === 'offline' ? 'On this phone' : 'With Gemini'}. This can take up to a minute.
        </p>
        {state.preview && <pre className="stream">{state.preview}</pre>}
        <button className="chip-button" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      </section>
    );
  }

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

      <div className="tiles">
        <label className="tile primary">
          <Icon name="camera" size={28} />
          <b>Scan receipt</b>
          <small>{mode === 'offline' ? 'The photo stays on this phone' : 'The photo is sent to Gemini'}</small>
          <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
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
            <button className="row" onClick={goToSettings}>
              <Avatar name="download" tone="mint" />
              <span className="row-text">
                <b>Download the offline model</b>
                <small>Once, about 2–3 GB. Use Wi-Fi.</small>
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
            {state.error instanceof AppError && state.error.code === 'MODEL_NOT_DOWNLOADED' && (
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
            )}
          </div>
        </div>
      )}
    </section>
  );
}
