/**
 * Monthly summary + insights with a privacy preview (docs/ARCHITECTURE.md §6.3).
 * The JSON shown in the preview is exactly what gets sent.
 */
import {
  generateInsights,
  loadMonth,
  previewInsights,
  selectProvider,
  summarize,
  toUserMessage,
  type InsightPreview,
  type InsightResult,
  type LLMProvider,
  type Mode,
  type Privacy,
  type Summary,
} from '@ghostledger/core';
import { useEffect, useState } from 'react';
import { Avatar, categoryIcon, Icon } from '../components/Icon';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { useApp } from '../lib/app-context';
import { formatMoney } from '../lib/files';
import { currentMonth, useOnline } from '../lib/hooks';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InsightsScreen() {
  const { ledger, providers, settings, updateSettings } = useApp();
  const isOnline = useOnline();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  // The same app-wide mode as the Add screen (saved in Settings).
  const mode = settings.defaultMode;
  const setMode = (m: Mode) => {
    updateSettings({ defaultMode: m });
    setPending(null);
  };
  const [privacy, setPrivacy] = useState<Privacy>('aggregates');
  const [pending, setPending] = useState<{ preview: InsightPreview; provider: LLMProvider; fallback: boolean } | null>(null);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [streamed, setStreamed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPending(null);
    setResult(null);
    loadMonth(ledger, month).then((r) => setSummary(summarize(r, month)));
  }, [ledger, month]);

  const preview = async () => {
    setError(null);
    setResult(null);
    try {
      const { provider, fallback } = await selectProvider(providers, mode);
      setPending({ preview: await previewInsights(ledger, provider, { month, privacy }), provider, fallback });
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const send = async () => {
    if (!pending) return;
    setBusy(true);
    setStreamed('');
    setError(null);
    try {
      setResult(
        await generateInsights(pending.preview, pending.provider, {
          language: settings.language,
          fallback: pending.fallback,
          onToken: (t) => setStreamed((s) => s + t),
        }),
      );
      setPending(null);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Bars are relative to the biggest category in the same currency.
  const maxByCurrency = new Map<string, number>();
  for (const c of summary?.by_category ?? []) {
    maxByCurrency.set(c.currency, Math.max(maxByCurrency.get(c.currency) ?? 0, c.amount));
  }

  return (
    <section>
      <div className="balance">
        <MonthSwitcher month={month} onChange={setMonth} />
        <p className="balance-label">
          {summary?.receipt_count ?? 0} {summary?.receipt_count === 1 ? 'receipt' : 'receipts'}
        </p>
        {summary && Object.keys(summary.currency_totals).length > 0 ? (
          Object.entries(summary.currency_totals).map(([c, v]) => {
            const [n, code] = formatMoney(v, c).split(' ');
            return (
              <p key={c} className="balance-amount">
                {n} <span>{code}</span>
              </p>
            );
          })
        ) : (
          <p className="balance-amount">0</p>
        )}
      </div>

      {summary && summary.receipt_count === 0 && (
        <div className="empty">
          <Avatar name="chart" />
          <p className="muted">Nothing saved this month yet.</p>
        </div>
      )}

      {summary && summary.receipt_count > 0 && (
        <>
          <h2 className="day-title">Where it went</h2>
          <ul className="rows card">
            {summary.by_category.map((c) => (
              <li key={`${c.category}-${c.currency}`} className="row">
                <Avatar name={categoryIcon(c.category)} />
                <span className="row-text">
                  <b>{capitalize(c.category)}</b>
                  <span className="bar">
                    <span style={{ width: `${(c.amount / (maxByCurrency.get(c.currency) || 1)) * 100}%` }} />
                  </span>
                </span>
                <span className="row-amount">{formatMoney(c.amount, c.currency)}</span>
              </li>
            ))}
          </ul>

          <h2 className="day-title">Get advice</h2>
          <div className="segmented" role="radiogroup" aria-label="Who analyzes the month">
            <button role="radio" aria-checked={mode === 'offline'} onClick={() => setMode('offline')}>
              On this phone
            </button>
            <button role="radio" aria-checked={mode === 'online'} onClick={() => setMode('online')} disabled={!isOnline}>
              Gemini 31B
            </button>
          </div>

          {mode === 'online' && (
            <label className="field">
              <span>What may leave this phone</span>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
                <option value="aggregates">Category totals only (recommended)</option>
                <option value="full">Every item, never images</option>
              </select>
            </label>
          )}

          {!pending && !result && (
            <button className="primary-button" onClick={preview} disabled={busy}>
              See what will be analyzed
            </button>
          )}
        </>
      )}

      {pending && (
        <div className="card padded">
          <div className="notice flat">
            <Avatar name={pending.preview.mode === 'online' ? 'cloud' : 'lock'} tone={pending.preview.mode === 'online' ? 'warn' : 'mint'} />
            <p>
              Goes to <b>{pending.preview.destination}</b>
              {pending.fallback && ' (Gemini unavailable, using this phone)'}
            </p>
          </div>
          <pre className="payload">{JSON.stringify(pending.preview.payload, null, 2)}</pre>
          <button className="primary-button" onClick={send} disabled={busy}>
            {busy ? 'Thinking…' : pending.preview.mode === 'online' ? 'Send exactly this' : 'Analyze on this phone'}
          </button>
          <button className="text-button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {busy && streamed && <pre className="stream">{streamed}</pre>}
      {error && <p className="error-text">{error}</p>}

      {result && (
        <div className="card padded">
          {/* TODO: render Markdown (e.g. react-markdown). Plain text keeps the skeleton dependency-free. */}
          <div className="markdown">{result.text}</div>
          <p className="muted small">
            <Icon name="check" size={14} /> {result.meta.model} · {(result.meta.elapsed_ms / 1000).toFixed(0)} s
          </p>
        </div>
      )}
    </section>
  );
}
