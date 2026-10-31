/** Saves a file on the phone: the share sheet where supported (iOS/Android), otherwise a normal download. */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/** "3,960 HUF", "12.50 EUR": amount then ISO code, like banking apps. Whole amounts drop the decimals. */
export function formatMoney(amount: number, currency: string): string {
  try {
    const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const shown = Number.isInteger(amount) ? 0 : digits;
    const n = new Intl.NumberFormat(undefined, { minimumFractionDigits: shown, maximumFractionDigits: shown }).format(amount);
    return `${n} ${currency}`;
  } catch {
    return `${amount} ${currency}`;
  }
}

/** "Today", "Yesterday", or "Thu 29 Oct" for a YYYY-MM-DD date. */
export function formatDayLabel(iso: string): string {
  const day = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}
