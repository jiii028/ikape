import { openDB } from 'idb';
import { supabase } from './supabase';

const DB_NAME = 'ikape-offline-db';
const STORE_NAME = 'pending_sync';
const CACHE_STORE = 'data_cache';
const FAILED_SYNC_STORE = 'failed_sync';
const OPTIMISTIC_STORE = 'optimistic_data';

// Auth state callback for handling 401 errors
let authErrorCallback = null;
// Sync complete callback
let syncCompleteCallback = null;

export function setAuthErrorCallback(callback) {
  authErrorCallback = callback;
}

export function setSyncCompleteCallback(callback) {
  syncCompleteCallback = callback;
}

// 1. Initialize IndexedDB
export async function initDB() {
  return openDB(DB_NAME, 4, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        db.createObjectStore(FAILED_SYNC_STORE, { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        db.createObjectStore(OPTIMISTIC_STORE, { keyPath: 'id' });
      }
    },
  });
}

// 2. Save record offline (called when user submits form offline)
export async function saveOfflineRecord(tableName, payload, action = 'insert') {
  const db = await initDB();
  
  // Generate a client-side UUID to prevent collisions when syncing
  const recordId = payload.id || crypto.randomUUID(); 
  
  const syncRecord = {
    id: crypto.randomUUID(), // Unique ID for the sync queue entry
    recordId: recordId, // The actual ID of the record being modified
    tableName,
    action,
    payload: { ...payload, id: recordId }, // Ensure payload has the ID
    timestamp: Date.now(),
    retry_count: 0
  };

  await db.put(STORE_NAME, syncRecord);
  return syncRecord;
}

// Check if error is an authentication error
function isAuthError(error) {
  if (!error) return false;
  // Check for various auth error indicators
  return (
    error.code === 'PGRST301' || // PostgREST JWT error
    error.code === '401' ||
    error.message?.includes('JWT') ||
    error.message?.includes('token') ||
    error.message?.includes('unauthorized') ||
    error.message?.includes('Unauthorized') ||
    error.status === 401
  );
}

// Check if error is a conflict error (duplicate key, constraint violation)
function isConflictError(error) {
  if (!error) return false;
  return (
    error.code === '23505' || // unique_violation
    error.code === '23503' || // foreign_key_violation
    error.message?.includes('duplicate') ||
    error.message?.includes('conflict')
  );
}

// 3. Sync Manager Logic with Auth Handling & Conflict Resolution
export async function syncPendingRecords() {
  if (!navigator.onLine) return;
  
  // Prevent concurrent sync operations
  if (syncInProgress) {
    console.log('[syncPendingRecords] Sync already in progress, skipping...');
    return;
  }
  syncInProgress = true;

  try {
    const db = await initDB();
  
  // Get all pending records
  const allRecords = await db.getAll(STORE_NAME);
  if (allRecords.length === 0) return;

  console.log(`Attempting to sync ${allRecords.length} records...`);

  // Sort records: parent tables first, then by timestamp
  // Priority order: farms -> clusters -> cluster_lifecycle_events -> others
  const tablePriority = { farms: 1, clusters: 2, cluster_lifecycle_events: 3 };
  const records = allRecords.sort((a, b) => {
    const priorityA = tablePriority[a.tableName] || 99;
    const priorityB = tablePriority[b.tableName] || 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.timestamp - b.timestamp;
  });

  // Track client ID -> server ID mappings for successfully synced records
  const idMappings = new Map();
  // Track which client IDs were successfully synced (to remove from UI)
  const syncedClientIds = [];

  for (const record of records) {
    try {
      let error = null;
      let result = null;

      // Get the payload and replace any client IDs with server IDs
      let payload = { ...record.payload };
      
      // Replace foreign key references with server IDs
      if (payload.cluster_id && idMappings.has(payload.cluster_id)) {
        payload.cluster_id = idMappings.get(payload.cluster_id);
      }
      if (payload.farm_id && idMappings.has(payload.farm_id)) {
        payload.farm_id = idMappings.get(payload.farm_id);
      }

      if (record.action === 'insert') {
        // Remove client-generated ID to let Supabase generate one
        const { id, ...insertData } = payload;
        const { data, error: insertError } = await supabase
          .from(record.tableName)
          .insert(insertData)
          .select()
          .single();
        error = insertError;
        result = data;
        
        // Map client ID to server ID for future reference
        if (data?.id && record.payload.id) {
          idMappings.set(record.payload.id, data.id);
          syncedClientIds.push(record.payload.id);
          console.log(`Mapped ${record.tableName}: ${record.payload.id} -> ${data.id}`);
        }
      } else if (record.action === 'update') {
        // For updates, check if the record exists first
        const { data: existingData, error: fetchError } = await supabase
          .from(record.tableName)
          .select('id')
          .eq('id', record.recordId)
          .maybeSingle();

        if (fetchError) {
          error = fetchError;
        } else if (existingData) {
          // Record exists - update it
          const { id, ...updateData } = payload;
          const { error: updateError } = await supabase
            .from(record.tableName)
            .update(updateData)
            .eq('id', record.recordId);
          error = updateError;
        } else {
          // Record doesn't exist on server - treat as insert
          const { id, ...insertData } = payload;
          const { data, error: insertError } = await supabase
            .from(record.tableName)
            .insert(insertData)
            .select()
            .single();
          error = insertError;
          result = data;
          
          // Map client ID to server ID
          if (data?.id && record.payload.id) {
            idMappings.set(record.payload.id, data.id);
          }
        }
      } else if (record.action === 'delete') {
        const { error: deleteError } = await supabase
          .from(record.tableName)
          .delete()
          .eq('id', record.recordId);
        error = deleteError;
      }

      // Handle authentication errors
      if (error && isAuthError(error)) {
        console.error(`Auth error for record ${record.id}:`, error.message);
        // Trigger auth error callback if set
        if (authErrorCallback) {
          authErrorCallback(error);
        }
        // Stop syncing - don't process remaining records
        break;
      }

      // Handle conflict errors
      if (error && isConflictError(error)) {
        console.warn(`Conflict error for record ${record.id}:`, error.message);
        // For conflicts, move to failed sync with conflict flag
        await moveToFailedSync(db, record, error, 'conflict');
        // Delete from pending using a new transaction
        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
        const deleteStore = deleteTx.objectStore(STORE_NAME);
        await deleteStore.delete(record.id);
        continue;
      }

      if (error) throw error;

      // If successful, remove from IndexedDB using a new transaction
      const successTx = db.transaction(STORE_NAME, 'readwrite');
      const successStore = successTx.objectStore(STORE_NAME);
      await successStore.delete(record.id);
      
      // Also clear from optimistic cache if it was an offline-created record
      if (record.payload.id) {
        await clearOptimisticData(record.payload.id);
      }
      
      console.log(`Successfully synced record: ${record.id}`);
    } catch (err) {
      console.error(`Failed to sync record ${record.id}:`, err);
      
      // Increment retry count
      record.retry_count = (record.retry_count || 0) + 1;
      record.last_error = err.message;
      record.last_error_time = Date.now();

      if (record.retry_count >= 3) {
        // Move to failed sync store after 3 retries
        console.error(`Record ${record.id} failed 3 times. Moving to failed_sync store.`);
        await moveToFailedSync(db, record, err, 'max_retries');
        // Delete from pending using a new transaction
        const failTx = db.transaction(STORE_NAME, 'readwrite');
        const failStore = failTx.objectStore(STORE_NAME);
        await failStore.delete(record.id);
      } else {
        // Update record with new retry count using a new transaction
        const retryTx = db.transaction(STORE_NAME, 'readwrite');
        const retryStore = retryTx.objectStore(STORE_NAME);
        await retryStore.put(record);
      }
    }
  }
  
    // Trigger sync complete callback with synced IDs for cleanup
    if (syncCompleteCallback) {
      syncCompleteCallback(syncedClientIds);
    }
  } finally {
    syncInProgress = false;
    console.log('[syncPendingRecords] Sync completed, flag reset');
  }
}

// Move a failed record to the failed_sync store
async function moveToFailedSync(db, record, error, reason) {
  const failedTx = db.transaction(FAILED_SYNC_STORE, 'readwrite');
  const failedStore = failedTx.objectStore(FAILED_SYNC_STORE);
  
  const failedRecord = {
    ...record,
    failed_at: Date.now(),
    fail_reason: reason,
    error_message: error?.message || 'Unknown error',
    error_code: error?.code || null,
  };
  
  await failedStore.put(failedRecord);
  console.log(`Moved record ${record.id} to failed_sync store. Reason: ${reason}`);
}

// Get all failed sync records
export async function getFailedSyncRecords() {
  const db = await initDB();
  return db.getAll(FAILED_SYNC_STORE);
}

// Get count of failed sync records
export async function getFailedSyncCount() {
  const db = await initDB();
  return db.count(FAILED_SYNC_STORE);
}

// Retry a failed sync record
export async function retryFailedRecord(recordId) {
  const db = await initDB();
  const failedTx = db.transaction(FAILED_SYNC_STORE, 'readwrite');
  const failedStore = failedTx.objectStore(FAILED_SYNC_STORE);
  
  const record = await failedStore.get(recordId);
  if (!record) return false;
  
  // Reset retry count and move back to pending
  record.retry_count = 0;
  record.retried_at = Date.now();
  delete record.failed_at;
  delete record.fail_reason;
  delete record.error_message;
  delete record.error_code;
  
  const pendingTx = db.transaction(STORE_NAME, 'readwrite');
  const pendingStore = pendingTx.objectStore(STORE_NAME);
  await pendingStore.put(record);
  await failedStore.delete(recordId);
  
  // Trigger sync
  await syncPendingRecords();
  return true;
}

// Delete a failed sync record permanently
export async function deleteFailedRecord(recordId) {
  const db = await initDB();
  const failedTx = db.transaction(FAILED_SYNC_STORE, 'readwrite');
  const failedStore = failedTx.objectStore(FAILED_SYNC_STORE);
  await failedStore.delete(recordId);
  return true;
}

// Clear all failed sync records
export async function clearAllFailedRecords() {
  const db = await initDB();
  const failedTx = db.transaction(FAILED_SYNC_STORE, 'readwrite');
  const failedStore = failedTx.objectStore(FAILED_SYNC_STORE);
  await failedStore.clear();
  return true;
}

// Track if listeners are already set up to prevent duplicates
let listenersSetup = false;
let syncInProgress = false;

// 4. Setup Event Listeners
export function setupSyncListeners() {
  // Prevent multiple listeners from being registered
  if (listenersSetup) {
    console.log('[setupSyncListeners] Listeners already set up, skipping');
    return;
  }
  listenersSetup = true;
  
  window.addEventListener('online', () => {
    console.log('[setupSyncListeners] App is online. Triggering sync...');
    syncPendingRecords();
  });
  
  if (navigator.onLine) {
    console.log('[setupSyncListeners] App already online, triggering initial sync...');
    syncPendingRecords();
  }
}

// 5. Get Pending Count (only count user-facing tables, not related records)
export async function getPendingCount() {
  const db = await initDB();
  const allRecords = await db.getAll(STORE_NAME);
  // Only count clusters and farms, not lifecycle events or other related records
  const userFacingTables = ['clusters', 'farms', 'harvest_records'];
  return allRecords.filter(r => userFacingTables.includes(r.tableName)).length;
}

// 6. Cache Refresh Logic
export async function refreshLocalCache(userId) {
  if (!navigator.onLine || !userId) return;
  
  const db = await initDB();
  
  try {
    // Fetch farms for the user
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('*')
      .eq('user_id', userId);
      
    if (farmsError) throw farmsError;
    
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    
    for (const farm of farms) {
      await store.put({ ...farm, _table: 'farms' }); 
    }
    await tx.done;
    console.log('Local cache updated successfully');
  } catch (err) {
    console.error('Failed to refresh local cache:', err);
  }
}

// 7. Offline Read Logic
export async function getCachedData(tableName) {
  const db = await initDB();
  const allData = await db.getAll(CACHE_STORE);
  return allData.filter(item => item._table === tableName);
}

// 8. Optimistic Data Functions (for immediate UI display while offline)
export async function saveOptimisticData(tableName, data) {
  const db = await initDB();
  const record = {
    ...data,
    _table: tableName,
    _isOptimistic: true,
    _createdOffline: !navigator.onLine,
  };
  await db.put(OPTIMISTIC_STORE, record);
  return record;
}

async function getOptimisticData(tableName) {
  const db = await initDB();
  const allData = await db.getAll(OPTIMISTIC_STORE);
  return allData.filter(item => item._table === tableName);
}

export async function getCombinedData(tableName) {
  const [cachedData, optimisticData] = await Promise.all([
    getCachedData(tableName),
    getOptimisticData(tableName),
  ]);
  
  // Merge, with optimistic data taking precedence
  const combined = [...cachedData];
  
  for (const optRecord of optimisticData) {
    const existingIndex = combined.findIndex(c => c.id === optRecord.id);
    if (existingIndex >= 0) {
      combined[existingIndex] = { ...combined[existingIndex], ...optRecord };
    } else {
      combined.push(optRecord);
    }
  }
  
  return combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export async function clearOptimisticData(id) {
  const db = await initDB();
  await db.delete(OPTIMISTIC_STORE, id);
}

// 9. Helper function to remove pending operations for a record
export async function removePendingOperationsForRecord(recordId) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const allRecords = await store.getAll();
  
  for (const record of allRecords) {
    if (record.recordId === recordId || record.payload?.id === recordId) {
      await store.delete(record.id);
    }
  }
}

// 10. Check if a record has pending offline changes
export async function hasPendingChanges(recordId, tableName) {
  const db = await initDB();
  const allRecords = await db.getAll(STORE_NAME);
  return allRecords.some(r => 
    (r.recordId === recordId || r.payload?.id === recordId) && 
    r.tableName === tableName
  );
}

// 11. Get all offline records with optional filtering
export async function getOfflineRecords(tableName = null, action = null) {
  const db = await initDB();
  const allRecords = await db.getAll(STORE_NAME);
  
  return allRecords.filter(record => {
    if (tableName && record.tableName !== tableName) return false;
    if (action && record.action !== action) return false;
    return true;
  });
}
