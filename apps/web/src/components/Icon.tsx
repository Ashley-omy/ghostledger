/** Stroked line icons (24×24, currentColor). Inline SVG, so they work offline and look the same on every phone. */
import type { Category } from '@ghostledger/core';

const PATHS = {
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h4',
  chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  cloud: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 11 3.5 3.5 0 0 0 7 18z',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  key: 'M14 10a4 4 0 1 0-3.5 4L9 15.5V18H6.5v2.5H4V18l6-6M15.5 8.5v.01',
  // Categories
  groceries: 'M3 4h2.5l2 11h10l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  dining: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3',
  transport: 'M6 4h12a1 1 0 0 1 1 1v11H5V5a1 1 0 0 1 1-1zM5 11h14M8 19v-3M16 19v-3M8 13.5v.01M16 13.5v.01',
  household: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  entertainment: 'M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4zM10 4v12',
  other: 'M6 12h.01M12 12h.01M18 12h.01',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The round avatar on the left of a transaction or category row. */
export function Avatar({ name, tone = 'neutral' }: { name: IconName; tone?: 'neutral' | 'mint' | 'warn' }) {
  return (
    <span className={`avatar ${tone}`}>
      <Icon name={name} size={20} />
    </span>
  );
}

export const categoryIcon = (c: Category): IconName => c;
