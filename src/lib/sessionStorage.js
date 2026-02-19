// Manual session storage helper
const SESSION_KEY = 'ikape-session-backup'

export const saveSession = (session) => {
  try {
    if (session?.access_token && session?.user) {
      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user,
        timestamp: Date.now()
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
      return true
    }
  } catch (e) {
    console.error('Failed to save session:', e)
  }
  return false
}

export const loadSession = () => {
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      const session = JSON.parse(stored)
      const now = Date.now()
      const sessionAge = now - session.timestamp
      
      // Check if session is less than 7 days old
      if (sessionAge < 7 * 24 * 60 * 60 * 1000) {
        return session
      } else {
        clearSession()
      }
    }
  } catch (e) {
    console.error('Failed to load session:', e)
  }
  return null
}

export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (e) {
    console.error('Failed to clear session:', e)
  }
}
