import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows "ready to work offline" once, and "update available" when a new version is waiting. */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // "Ready offline" is informational, so hide it on its own. "Update available" waits for the user.
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="toast" role="status">
      {needRefresh ? 'A new version of GhostLedger is available.' : 'GhostLedger is ready to work offline.'}
      <div className="actions">
        {needRefresh && <button onClick={() => updateServiceWorker(true)}>Reload</button>}
        <button
          className="secondary"
          onClick={() => {
            setOfflineReady(false);
            setNeedRefresh(false);
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
