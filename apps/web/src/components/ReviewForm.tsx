/**
 * Editable draft with live validation. Warnings highlight the exact cell (item_index + field).
 * Used for new extractions, manual entry and editing saved receipts.
 */
import {
  CATEGORIES,
  ReceiptInput,
  validate,
  type Item,
  type ModelMeta,
  type Warning,
} from '@ghostledger/core';
import { useMemo, useState } from 'react';

interface Props {
  initial: ReceiptInput;
  /** Warnings only post-processing knows about (e.g. TAX_LOOKS_LIKE_RATE). Dropped once the field is edited. */
  extraWarnings?: Warning[];
  meta?: ModelMeta;
  saveLabel?: string;
  onSave: (receipt: ReceiptInput) => Promise<void>;
  onCancel: () => void;
}

const ITEM_FIELDS = ['name', 'name_en', 'qty', 'unit_price', 'price', 'category'] as const;

export function emptyReceipt(): ReceiptInput {
  return {
    store: '',
    date: new Date().toISOString().slice(0, 10),
    currency: 'HUF',
    payment_method: null,
    items: [{ name: '', name_en: null, qty: 1, unit_price: null, price: 0, category: 'groceries' }],
    tax_amount: null,
    total: 0,
    source_mode: null,
  };
}

export function ReviewForm({ initial, extraWarnings = [], meta, saveLabel = 'Save', onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<ReceiptInput>(initial);
  const [extra, setExtra] = useState<Warning[]>(extraWarnings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validation = useMemo(() => validate(draft, { extra }), [draft, extra]);
  const parsed = useMemo(() => ReceiptInput.safeParse(draft), [draft]);

  const warnFor = (field: string, itemIndex: number | null = null) =>
    validation.warnings.filter((w) => w.field === field && w.item_index === itemIndex);

  const touched = (field: string, itemIndex: number | null = null) =>
    setExtra((ws) => ws.filter((w) => !(w.field === field && w.item_index === itemIndex)));

  const setField = <K extends keyof ReceiptInput>(key: K, value: ReceiptInput[K]) => {
    touched(key);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const setItem = (i: number, patch: Partial<Item>) => {
    for (const key of Object.keys(patch)) touched(key, i);
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  };

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const save = async () => {
    if (!parsed.success) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(parsed.data);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const cls = (warnings: Warning[]) => (warnings.length ? 'warn' : undefined);

  return (
    <div className="review">
      {meta && (
        <p className="muted">
          Read by <b>{meta.model}</b> ({meta.mode_used}) in {(meta.elapsed_ms / 1000).toFixed(1)} s
          {meta.fallback && ' — Online was unavailable, so Offline was used.'}
        </p>
      )}

      <div className="grid2">
        <label className={cls(warnFor('store'))}>
          Store
          <input value={draft.store} onChange={(e) => setField('store', e.target.value)} />
        </label>
        <label className={cls(warnFor('date'))}>
          Date
          <input type="date" value={draft.date} onChange={(e) => setField('date', e.target.value)} />
        </label>
        <label className={cls(warnFor('currency'))}>
          Currency
          <input
            value={draft.currency}
            maxLength={3}
            onChange={(e) => setField('currency', e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Payment
          <select
            value={draft.payment_method ?? ''}
            onChange={(e) => setField('payment_method', (e.target.value || null) as ReceiptInput['payment_method'])}
          >
            <option value="">—</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={cls(warnFor('total'))}>
          Total
          <input type="number" inputMode="decimal" value={draft.total} onChange={(e) => setField('total', Number(e.target.value))} />
        </label>
        <label className={cls(warnFor('tax_amount'))}>
          Tax amount
          <input
            type="number"
            inputMode="decimal"
            value={draft.tax_amount ?? ''}
            onChange={(e) => setField('tax_amount', num(e.target.value))}
          />
        </label>
      </div>

      <div className="items">
        {draft.items.map((it, i) => (
          <fieldset key={i} className="item">
            <legend>
              Item {i + 1}
              <button
                type="button"
                className="link"
                disabled={draft.items.length === 1}
                onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
              >
                Remove
              </button>
            </legend>
            {ITEM_FIELDS.map((field) => {
              const warnings = warnFor(field, i);
              const value = it[field];
              return (
                <label key={field} className={cls(warnings)}>
                  {field}
                  {field === 'category' ? (
                    <select value={it.category} onChange={(e) => setItem(i, { category: e.target.value as Item['category'] })}>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : field === 'name' || field === 'name_en' ? (
                    <input value={(value as string | null) ?? ''} onChange={(e) => setItem(i, { [field]: e.target.value })} />
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      value={(value as number | null) ?? ''}
                      onChange={(e) =>
                        setItem(i, { [field]: field === 'unit_price' ? num(e.target.value) : Number(e.target.value) })
                      }
                    />
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              items: [...d.items, { name: '', name_en: null, qty: 1, unit_price: null, price: 0, category: 'other' }],
            }))
          }
        >
          + Add item
        </button>
      </div>

      <div className={validation.ok ? 'check ok' : 'check'}>
        Items sum <b>{validation.items_sum}</b> · total <b>{draft.total}</b> · difference <b>{validation.difference}</b>
        {validation.warnings.length > 0 && (
          <ul>
            {validation.warnings.map((w, i) => (
              <li key={i}>
                <code>{w.code}</code> {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!parsed.success && (
        <p className="error">Fix before saving: {parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}</p>
      )}
      {saveError && <p className="error">{saveError}</p>}

      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" disabled={!parsed.success || saving} onClick={save}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
