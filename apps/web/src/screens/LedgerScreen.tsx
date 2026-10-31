/** Saved receipts for a month: list, edit, delete, CSV export and full backup. */
import { csvBlob, itemsSum, monthRange, toUserMessage, type Receipt } from '@ghostledger/core';
import { useCallback, useEffect, useState } from 'react';
import { Avatar, categoryIcon, Icon } from '../components/Icon';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { ReviewForm } from '../components/ReviewForm';
import { useApp } from '../lib/app-context';
import { formatDayLabel, formatMoney, saveFile } from '../lib/files';
import { currentMonth } from '../lib/hooks';

const PAYMENT_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', mobile: 'Phone', other: 'Other' };

/** The category with the most money on the receipt, for the row icon. */
function mainCategory(r: Receipt) {
  const by = new Map<string, number>();
  for (const it of r.items) by.set(it.category, (by.get(it.category) ?? 0) + it.price);
  return ([...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other') as Receipt['items'][number]['category'];
}

interface Props {
  justSaved: Receipt | null;
  onAdd: () => void;
}

export function LedgerScreen({ justSaved, onAdd }: Props) {
  const { ledger } = useApp();
  const [month, setMonth] = useState(() => justSaved?.date.slice(0, 7) ?? currentMonth());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  /** Month of the newest saved receipt, shown when the selected month is empty. */
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(justSaved?.id ?? null);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { items } = await ledger.list({ ...monthRange(month), limit: 10_000 });
      setReceipts(items);
      if (items.length === 0) {
        const { items: newest } = await ledger.list({ limit: 1 });
        setLatestMonth(newest[0]?.date.slice(0, 7) ?? null);
      }
      setError(null);
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [ledger, month]);

  useEffect(() => {
    void reload();
    void ledger.persistent().then(setPersistent);
  }, [reload, ledger]);

  if (editing) {
    return (
      <section>
        <h1>Edit receipt</h1>
        <ReviewForm
          initial={editing}
          saveLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await ledger.update(editing.id, input);
            setEditing(null);
            // Follow the receipt if its date moved it to another month; the effect reloads on month change.
            if (input.date.slice(0, 7) !== month) setMonth(input.date.slice(0, 7));
            else await reload();
          }}
        />
      </section>
    );
  }

  const exportAll = async () => {
    const { items } = await ledger.list({ limit: 10_000 });
    await saveFile(csvBlob(items), `ghostledger-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const backup = async () => {
    const bytes = await ledger.exportDatabase();
    await saveFile(new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }), 'ghostledger.sqlite3');
  };

  // A month can mix currencies (e.g. a trip), so total per currency.
  const totals = new Map<string, number>();
  for (const r of receipts) totals.set(r.currency, (totals.get(r.currency) ?? 0) + itemsSum(r));

  // Receipts come newest first; group them under one heading per day.
  const days: { date: string; receipts: Receipt[] }[] = [];
  for (const r of receipts) {
    const last = days[days.length - 1];
    if (last?.date === r.date) last.receipts.push(r);
    else days.push({ date: r.date, receipts: [r] });
  }

  return (
    <section>
      <div className="balance">
        <MonthSwitcher month={month} onChange={setMonth} />
        <p className="balance-label">Spent this month</p>
        {totals.size === 0 ? (
          <p className="balance-amount">0</p>
        ) : (
          [...totals].map(([currency, amount]) => {
            const [num, code] = formatMoney(amount, currency).split(' ');
            return (
              <p key={currency} className="balance-amount">
                {num} <span>{code}</span>
              </p>
            );
          })
        )}
        <div className="chips">
          <button className="chip-button primary" onClick={onAdd}>
            <Icon name="plus" size={18} /> Add receipt
          </button>
          <button className="chip-button" onClick={exportAll}>
            <Icon name="download" size={18} /> Export
          </button>
          <button className="chip-button" onClick={backup}>
            Backup
          </button>
        </div>
      </div>

      {!persistent && (
        <div className="notice warn">
          <Avatar name="alert" tone="warn" />
          <p>This browser can't keep the ledger after you close the app.</p>
        </div>
      )}
      {justSaved && (
        <div className="notice">
          <Avatar name="check" tone="mint" />
          <p>
            <b>Saved.</b> {justSaved.store || 'Your receipt'} is in your ledger.
          </p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {receipts.length === 0 && (
        <div className="empty">
          <Avatar name="receipt" />
          <p>
            <b>No receipts this month</b>
          </p>
          {latestMonth && latestMonth !== month ? (
            <button className="link" onClick={() => setMonth(latestMonth)}>
              Go to the latest month with receipts
            </button>
          ) : (
            <p className="muted">Scan your first receipt and it shows up here.</p>
          )}
        </div>
      )}

      {days.map((day) => (
        <div key={day.date} className="day">
          <h2 className="day-title">{formatDayLabel(day.date)}</h2>
          <ul className="rows">
            {day.receipts.map((r) => (
              <li key={r.id} className={open === r.id ? 'open' : undefined}>
                <button className="row" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <Avatar name={categoryIcon(mainCategory(r))} />
                  <span className="row-text">
                    <b>{r.store || 'Unknown store'}</b>
                    <small>
                      {r.items.length} {r.items.length === 1 ? 'item' : 'items'}
                      {r.payment_method ? ` · ${PAYMENT_LABEL[r.payment_method] ?? r.payment_method}` : ''}
                    </small>
                  </span>
                  <span className="row-amount">{formatMoney(itemsSum(r), r.currency)}</span>
                </button>
                {open === r.id && (
                  <div className="row-detail">
                    <ul className="lines">
                      {r.items.map((it, i) => (
                        <li key={i}>
                          <span>
                            {it.name}
                            {it.name_en && it.name_en !== it.name && <small>{it.name_en}</small>}
                          </span>
                          <span className="row-amount">{formatMoney(it.price, r.currency)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="detail-actions">
                      <button className="chip-button" onClick={() => setEditing(r)}>
                        <Icon name="pencil" size={16} /> Edit
                      </button>
                      <button
                        className="chip-button danger"
                        onClick={async () => {
                          if (!confirm('Delete this receipt?')) return;
                          await ledger.remove(r.id);
                          await reload();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
