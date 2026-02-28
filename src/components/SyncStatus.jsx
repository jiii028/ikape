import React, { useState } from 'react';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { syncPendingRecords, getFailedSyncRecords, retryFailedRecord, deleteFailedRecord, clearAllFailedRecords } from '../lib/syncManager';

export const SyncStatus = () => {
  const { isOnline, pendingCount, failedCount, refresh } = useSyncStatus();
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [failedRecords, setFailedRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleManualSync = async () => {
    if (isOnline && pendingCount > 0) {
      setIsLoading(true);
      await syncPendingRecords();
      await refresh();
      setIsLoading(false);
    }
  };

  const handleShowFailed = async () => {
    const records = await getFailedSyncRecords();
    setFailedRecords(records);
    setShowFailedModal(true);
  };

  const handleRetryFailed = async (recordId) => {
    setIsLoading(true);
    await retryFailedRecord(recordId);
    const records = await getFailedSyncRecords();
    setFailedRecords(records);
    await refresh();
    setIsLoading(false);
  };

  const handleDeleteFailed = async (recordId) => {
    setIsLoading(true);
    await deleteFailedRecord(recordId);
    const records = await getFailedSyncRecords();
    setFailedRecords(records);
    await refresh();
    setIsLoading(false);
  };

  const handleClearAllFailed = async () => {
    if (confirm('Are you sure you want to clear all failed sync records? This action cannot be undone.')) {
      setIsLoading(true);
      await clearAllFailedRecords();
      setFailedRecords([]);
      await refresh();
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 shadow-sm">
        {/* Network Indicator */}
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-700">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Failed Sync Badge */}
        {failedCount > 0 && (
          <button
            onClick={handleShowFailed}
            className="flex items-center gap-2 px-2 py-1 rounded text-xs font-bold transition-all bg-red-600 text-white hover:bg-red-700 cursor-pointer"
          >
            ⚠ Failed ({failedCount})
          </button>
        )}

        {/* Sync Badge */}
        {pendingCount > 0 && (
          <button
            onClick={handleManualSync}
            disabled={!isOnline || isLoading}
            className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-bold transition-all
              ${isOnline
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-orange-500 text-white cursor-wait'}`}
          >
            {isLoading ? '...' : (isOnline ? '↑ Sync Now' : 'Pending')} ({pendingCount})
          </button>
        )}
        
        {pendingCount === 0 && failedCount === 0 && isOnline && (
          <span className="text-xs text-gray-400">Synced</span>
        )}
      </div>

      {/* Failed Sync Modal */}
      {showFailedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowFailedModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Failed Sync Records</h2>
              <button
                onClick={() => setShowFailedModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {failedRecords.length === 0 ? (
              <p className="text-gray-600">No failed records.</p>
            ) : (
              <>
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={handleClearAllFailed}
                    disabled={isLoading}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                  >
                    Clear All Failed Records
                  </button>
                </div>
                <div className="space-y-3">
                  {failedRecords.map((record) => (
                    <div key={record.id} className="border border-gray-200 rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-800">
                            {record.tableName} • {record.action}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Reason: {record.fail_reason}
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            Error: {record.error_message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Failed at: {new Date(record.failed_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleRetryFailed(record.id)}
                            disabled={isLoading}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => handleDeleteFailed(record.id)}
                            disabled={isLoading}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
