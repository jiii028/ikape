import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { testDatabaseConnection } from '../lib/testDatabase'

export default function SessionDebug() {
  const [sessionInfo, setSessionInfo] = useState(null)
  const [storageInfo, setStorageInfo] = useState([])
  const { user, authUser, loading } = useAuth()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      setSessionInfo({
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        expiresAt: session?.expires_at,
        error: error?.message
      })

      // Check localStorage
      const keys = Object.keys(localStorage)
      const authKeys = keys.filter(k => 
        k.includes('auth') || 
        k.includes('supabase') || 
        k.includes('sb-') ||
        k.includes('ikape') ||
        k.toLowerCase().includes('token')
      )
      setStorageInfo(authKeys.map(key => ({
        key,
        hasValue: !!localStorage.getItem(key),
        length: localStorage.getItem(key)?.length || 0
      })))
      
      // Also log ALL localStorage keys for debugging
      if (keys.length === 0) {
        console.warn('⚠️ localStorage is completely empty!')
      } else {
        console.log('ALL localStorage keys:', keys)
      }
    }

    checkSession()
    const interval = setInterval(checkSession, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: 10,
      right: 10,
      background: '#fff',
      border: '2px solid #333',
      borderRadius: 8,
      padding: 15,
      maxWidth: 400,
      fontSize: 12,
      fontFamily: 'monospace',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: 14 }}>🔍 Session Debug</h3>
      
      <div style={{ marginBottom: 10 }}>
        <strong>Auth Context:</strong>
        <div>Loading: {loading ? '✅' : '❌'}</div>
        <div>User: {user ? `✅ ${user.email}` : '❌'}</div>
        <div>Auth User: {authUser ? `✅ ${authUser.email}` : '❌'}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Supabase Session:</strong>
        {sessionInfo && (
          <>
            <div>Has Session: {sessionInfo.hasSession ? '✅' : '❌'}</div>
            <div>User ID: {sessionInfo.userId || 'N/A'}</div>
            <div>Email: {sessionInfo.email || 'N/A'}</div>
            {sessionInfo.expiresAt && (
              <div>Expires: {new Date(sessionInfo.expiresAt * 1000).toLocaleTimeString()}</div>
            )}
            {sessionInfo.error && (
              <div style={{ color: 'red' }}>Error: {sessionInfo.error}</div>
            )}
          </>
        )}
      </div>

      <div>
        <strong>LocalStorage Keys:</strong>
        {storageInfo.length === 0 ? (
          <div style={{ color: 'red' }}>❌ No auth keys found!</div>
        ) : (
          storageInfo.map(({ key, hasValue, length }) => (
            <div key={key}>
              {hasValue ? '✅' : '❌'} {key} ({length} chars)
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 10,
          width: '100%',
          padding: 8,
          background: '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        Refresh Page
      </button>
      
      <button
        onClick={() => testDatabaseConnection()}
        style={{
          marginTop: 8,
          width: '100%',
          padding: 8,
          background: '#28a745',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        Test Database
      </button>
    </div>
  )
}
