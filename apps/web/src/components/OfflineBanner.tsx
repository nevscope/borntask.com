import { useEffect, useState } from 'react';
import { color } from '../theme/tokens';

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 'none',
        padding: '8px 16px',
        background: color.warningTint,
        borderBottom: `1px solid ${color.warningBorder}`,
        color: color.warning,
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      You're offline. You can keep reading; new changes will not save until you reconnect.
    </div>
  );
}
