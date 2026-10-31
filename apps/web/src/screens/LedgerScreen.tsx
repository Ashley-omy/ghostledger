/** Saved receipts for a month: list, edit, delete, CSV export and full backup. */
import { csvBlob, itemsSum, monthRange, toUserMessage, type Receipt } from '@ghostledger/core';
import { useCallback, useEffect, useState } from 'react';
import { ReviewForm } from '../components/ReviewForm';
import { useApp } from '../lib/app-context';
import { saveFile, formatMoney } from '../lib/files';
import { currentMonth } from '../lib/hooks';

export function LedgerScreen() {
  const { ledger } = useApp();
  const [month, setMonth] = useState(currentMonth);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { items } = await ledger.list({ ...monthRange(month), limit: 10_000 });
      setReceipts(items);
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
        <h2>Edit receipt #{editing.id}</h2>
        <ReviewForm
          initial={editing}
          saveLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await ledger.update(editing.id, input);
            setEditing(null);
            await reload();
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

  return (
    <section>
      <h2>Ledger</h2>
      {!persistent && (
        <div className="banner">
          This browser can't store the ledger permanently (no OPFS). Receipts will be lost when you close the app.
        </div>
      )}

      <div className="row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="secondary" onClick={exportAll}>
          Export CSV
        </button>
        <button className="secondary" onClick={backup}>
          Backup
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {receipts.length === 0 && <p className="muted">No receipts in this month.</p>}

      <ul className="list">
        {receipts.map((r) => (
          <li key={r.id}>
            <button className="list-row" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span>
                <b>{r.store || 'Unknown store'}</b>
                <small>
                  {r.date} · {r.items.length} items {r.source_mode ? `· ${r.source_mode}` : ''}
                </small>
              </span>
              <span>{formatMoney(itemsSum(r), r.currency)}</span>
            </button>
            {open === r.id && (
              <div className="detail">
                <table>
                  <tbody>
                    {r.items.map((it, i) => (
                      <tr key={i}>
                        <td>
                          {it.name}
                          {it.name_en && it.name_en !== it.name && <small> · {it.name_en}</small>}
                        </td>
                        <td>{it.category}</td>
                        <td className="num">{it.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="actions">
                  <button className="secondary" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  <button
                    className="danger"
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
    </section>
  );
}
