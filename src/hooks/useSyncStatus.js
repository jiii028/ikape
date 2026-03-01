import { useState, useEffect } from 'react';
import { getPendingCount, getFailedSyncCount } from '../lib/syncManager';

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const updateStatus = async () => {
    setIsOnline(navigator.onLine);
    const [pending, failed] = await Promise.all([
      getPendingCount(),
      getFailedSyncCount()
    ]);
    setPendingCount(pending);
    setFailedCount(failed);
  };

  useEffect(() => {
    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    const interval = setInterval(updateStatus, 5000);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingCount, failedCount, refresh: updateStatus };
}
