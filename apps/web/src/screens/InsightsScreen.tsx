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
import { useApp } from '../lib/app-context';
import { formatMoney } from '../lib/files';
import { currentMonth, useOnline } from '../lib/hooks';

export function InsightsScreen() {
  const { ledger, providers, settings } = useApp();
  const isOnline = useOnline();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mode, setMode] = useState<Mode>(settings.defaultMode);
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

  return (
    <section>
      <h2>Insights</h2>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

      {summary && (
        <div className="card">
          <p>
            <b>{summary.receipt_count}</b> receipts ·{' '}
            {Object.entries(summary.currency_totals)
              .map(([c, v]) => formatMoney(v, c))
              .join(' · ') || 'nothing yet'}
          </p>
          <table>
            <tbody>
              {summary.by_category.map((c) => (
                <tr key={`${c.category}-${c.currency}`}>
                  <td>{c.category}</td>
                  <td className="num">{c.count}×</td>
                  <td className="num">{formatMoney(c.amount, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="segmented" role="radiogroup" aria-label="Mode">
        <button aria-pressed={mode === 'offline'} onClick={() => setMode('offline')}>
          📴 On this phone
        </button>
        <button aria-pressed={mode === 'online'} onClick={() => setMode('online')} disabled={!isOnline}>
          ☁️ Gemini 31B
        </button>
      </div>

      {mode === 'online' && (
        <label>
          What may leave this phone
          <select value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
            <option value="aggregates">Category totals only (recommended)</option>
            <option value="full">Every item (no images)</option>
          </select>
        </label>
      )}

      <button onClick={preview} disabled={!summary?.receipt_count || busy}>
        Preview what will be analyzed
      </button>

      {pending && (
        <div className="card">
          <p>
            Destination: <b>{pending.preview.destination}</b>
            {pending.fallback && ' (Online unavailable — using this phone instead)'}
          </p>
          <pre className="payload">{JSON.stringify(pending.preview.payload, null, 2)}</pre>
          <div className="actions">
            <button className="secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button onClick={send} disabled={busy}>
              {busy ? 'Thinking…' : pending.preview.mode === 'online' ? 'Send exactly this' : 'Analyze on this phone'}
            </button>
          </div>
        </div>
      )}

      {busy && streamed && <pre className="stream">{streamed}</pre>}
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="card">
          {/* TODO: render Markdown (e.g. react-markdown). Plain text keeps the skeleton dependency-free. */}
          <div className="markdown">{result.text}</div>
          <p className="muted">
            {result.meta.model} · {(result.meta.elapsed_ms / 1000).toFixed(1)} s
          </p>
        </div>
      )}
    </section>
  );
}
