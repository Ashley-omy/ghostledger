import { Icon } from './Icon';

/** "‹ October 2026 ›". Month is YYYY-MM; tapping the label opens the native month picker for big jumps. */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="month-switcher">
      <button className="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>
        <Icon name="chevronLeft" size={18} />
      </button>
      <label className="month-label">
        {label}
        <input type="month" value={month} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </label>
      <button className="icon-button" aria-label="Next month" onClick={() => shift(1)}>
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}
