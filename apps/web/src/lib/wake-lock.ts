/**
 * Keeps the screen on while the model downloads. Phones suspend or kill pages when the screen locks,
 * which stops the download. The lock is dropped by the browser when the page is hidden, so we take it
 * again when the page becomes visible. Returns a function that releases it.
 */
export function keepScreenOn(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  const acquire = async () => {
    if (released || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch {
      /* not allowed (e.g. low battery mode); the download still resumes later */
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };

  document.addEventListener('visibilitychange', onVisibility);
  void acquire();

  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => {});
  };
}
