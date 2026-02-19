const CACHE_PREFIX = 'ikape_cache:'
const memoryCache = new Map()

function isStorageAvailable() {
  return typeof window !== 'undefined' && !!window.sessionStorage
}

function isFresh(entry, maxAgeMs) {
  if (!entry || typeof entry.timestamp !== 'number') return false
  if (!maxAgeMs || maxAgeMs <= 0) return true
  return Date.now() - entry.timestamp <= maxAgeMs
}

export function getCached(key, maxAgeMs = 0) {
  if (!key) return null

  const memEntry = memoryCache.get(key)
  if (isFresh(memEntry, maxAgeMs)) return memEntry.data

  if (!isStorageAvailable()) return null

  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isFresh(parsed, maxAgeMs)) {
      window.sessionStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    memoryCache.set(key, parsed)
    return parsed.data
  } catch {
    return null
  }
}

export function setCached(key, data) {
  if (!key) return

  const entry = { timestamp: Date.now(), data }
  memoryCache.set(key, entry)

  if (!isStorageAvailable()) return

  try {
    window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Ignore quota and serialization failures.
  }
}

export function clearCached(key) {
  if (!key) return
  memoryCache.delete(key)

  if (!isStorageAvailable()) return

  try {
    window.sessionStorage.removeItem(CACHE_PREFIX + key)
  } catch {
    // Ignore storage access failures.
  }
}

export function clearCachedByPrefix(prefix) {
  if (!prefix) return

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }

  if (!isStorageAvailable()) return

  try {
    const fullPrefix = CACHE_PREFIX + prefix
    const keysToDelete = []
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (key && key.startsWith(fullPrefix)) keysToDelete.push(key)
    }
    keysToDelete.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Ignore storage access failures.
  }
}
