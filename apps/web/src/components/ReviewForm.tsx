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
import { formatMoney } from '../lib/files';
import { Avatar, categoryIcon, Icon } from './Icon';

interface Props {
  initial: ReceiptInput;
  /** Warnings only post-processing knows about (e.g. TAX_LOOKS_LIKE_RATE). Dropped once the field is edited. */
  extraWarnings?: Warning[];
  meta?: ModelMeta;
  saveLabel?: string;
  onSave: (receipt: ReceiptInput) => Promise<void>;
  onCancel: () => void;
}

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

const CATEGORY_LABEL: Record<Item['category'], string> = {
  groceries: 'Groceries',
  dining: 'Eating out',
  transport: 'Transport',
  household: 'Household',
  health: 'Health',
  entertainment: 'Fun',
  other: 'Other',
};

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

  const cls = (base: string, warnings: Warning[]) => (warnings.length ? `${base} warn` : base);
  const money = (n: number) => formatMoney(n, draft.currency || 'XXX');

  return (
    <div className="review">
      {meta && (
        <p className="muted small">
          Read {meta.mode_used === 'offline' ? 'on this phone' : 'by Gemini'} in {(meta.elapsed_ms / 1000).toFixed(0)} s
          {meta.fallback && '. Gemini was unavailable, so this phone was used'}
        </p>
      )}

      <div className={cls('amount-field', [...warnFor('total'), ...warnFor('currency')])}>
        <label htmlFor="total">Total paid</label>
        <div className="amount-input">
          <input
            id="total"
            type="number"
            inputMode="decimal"
            value={draft.total}
            onChange={(e) => setField('total', Number(e.target.value))}
          />
          <input
            className="currency"
            aria-label="Currency"
            value={draft.currency}
            maxLength={3}
            autoCapitalize="characters"
            onChange={(e) => setField('currency', e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className="form-grid">
        <label className={cls('field', warnFor('store'))}>
          <span>Store</span>
          <input value={draft.store} placeholder="Where did you shop?" onChange={(e) => setField('store', e.target.value)} />
        </label>
        <label className={cls('field', warnFor('date'))}>
          <span>Date</span>
          <input type="date" value={draft.date} onChange={(e) => setField('date', e.target.value)} />
        </label>
        <label className="field">
          <span>Paid with</span>
          <select
            value={draft.payment_method ?? ''}
            onChange={(e) => setField('payment_method', (e.target.value || null) as ReceiptInput['payment_method'])}
          >
            <option value="">Not sure</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Phone</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={cls('field', warnFor('tax_amount'))}>
          <span>Tax included</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="Optional"
            value={draft.tax_amount ?? ''}
            onChange={(e) => setField('tax_amount', num(e.target.value))}
          />
        </label>
      </div>

      <h2 className="day-title">
        {draft.items.length} {draft.items.length === 1 ? 'item' : 'items'}
      </h2>
      <ul className="rows card items">
        {draft.items.map((it, i) => (
          <li key={i} className={warnFor('price', i).length || warnFor('name', i).length ? 'warn' : undefined}>
            <div className="item-head">
              <Avatar name={categoryIcon(it.category)} />
              <input
                className={cls('item-name', warnFor('name', i))}
                aria-label={`Item ${i + 1} name`}
                placeholder="Item name"
                value={it.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
              />
              <input
                className={cls('item-price', warnFor('price', i))}
                aria-label={`Item ${i + 1} price`}
                type="number"
                inputMode="decimal"
                value={it.price}
                onChange={(e) => setItem(i, { price: Number(e.target.value) })}
              />
            </div>
            <div className="item-more">
              <select
                aria-label={`Item ${i + 1} category`}
                value={it.category}
                onChange={(e) => setItem(i, { category: e.target.value as Item['category'] })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove item ${i + 1}`}
                disabled={draft.items.length === 1}
                onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="item-more">
              <label className={cls('inline', warnFor('qty', i))}>
                Qty
                <input
                  type="number"
                  inputMode="decimal"
                  value={it.qty}
                  onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
                />
              </label>
              <label className={cls('inline', warnFor('unit_price', i))}>
                Each
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="–"
                  value={it.unit_price ?? ''}
                  onChange={(e) => setItem(i, { unit_price: num(e.target.value) })}
                />
              </label>
              <input
                className="item-translation"
                aria-label={`Item ${i + 1} English name`}
                placeholder="In English"
                value={it.name_en ?? ''}
                onChange={(e) => setItem(i, { name_en: e.target.value || null })}
              />
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="row add-row"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                items: [...d.items, { name: '', name_en: null, qty: 1, unit_price: null, price: 0, category: 'other' }],
              }))
            }
          >
            <Avatar name="plus" tone="mint" />
            <b>Add item</b>
          </button>
        </li>
      </ul>

      <div className={validation.ok ? 'summary ok' : 'summary'}>
        <div className="summary-row">
          <span>Items add up to</span>
          <b>{money(validation.items_sum)}</b>
        </div>
        <div className="summary-row">
          <span>Total paid</span>
          <b>{money(draft.total)}</b>
        </div>
        {validation.ok ? (
          <p className="summary-note">
            <Icon name="check" size={16} /> Everything adds up
          </p>
        ) : (
          validation.warnings.map((w, i) => (
            <p key={i} className="summary-note">
              <Icon name="alert" size={16} /> {w.message}
            </p>
          ))
        )}
      </div>

      {!parsed.success && (
        <p className="error-text">
          Fix before saving: {parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}
        </p>
      )}
      {saveError && <p className="error-text">{saveError}</p>}

      <div className="action-bar">
        <button type="button" className="primary-button" disabled={!parsed.success || saving} onClick={save}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
