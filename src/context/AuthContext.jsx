import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { saveSession, loadSession, clearSession } from '../lib/sessionStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const userRef = useRef(null)

  // Keep ref in sync with user state
  useEffect(() => {
    userRef.current = user
  }, [user])

  // Fetch user profile from the users table
  const fetchProfile = async (userId) => {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
      )
      
      const fetchPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      const { data, error: err } = await Promise.race([fetchPromise, timeoutPromise])
      
      if (err) {
        console.error('Error fetching profile:', err.message)
        return null
      }
      
      if (!data) {
        console.warn('No profile found for user')
      }
      
      return data
    } catch (error) {
      console.error('fetchProfile exception:', error.message)
      return null
    }
  }

  // Listen for auth state changes
  useEffect(() => {
    let isMounted = true
    
    // Timeout fallback to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        setLoading(false)
      }
    }, 8000) // Increased to 8 seconds

    // Initialize session on mount
    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (!isMounted) return
        
        // If no Supabase session, try manual backup
        if (!session) {
          const manualSession = loadSession()
          
          if (manualSession) {
            try {
              const { data, error } = await supabase.auth.setSession({
                access_token: manualSession.access_token,
                refresh_token: manualSession.refresh_token
              })
              
              if (data?.session?.user && !error) {
                setUser(data.session.user)
                const p = await fetchProfile(data.session.user.id)
                if (isMounted) {
                  setProfile(p)
                }
                return
              } else {
                clearSession()
              }
            } catch (restoreErr) {
              console.error('Error restoring session:', restoreErr)
              clearSession()
            }
          }
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError.message)
          setUser(null)
          setProfile(null)
          return
        }

        if (session?.user) {
          setUser(session.user)
          
          // Fetch profile in background - don't block loading
          fetchProfile(session.user.id).then(p => {
            if (isMounted) {
              setProfile(p)
            }
          }).catch(err => {
            console.error('Profile fetch error:', err)
          })
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
        if (isMounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
          clearTimeout(timeout)
        }
      }
    }

    initializeAuth()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user)
            const p = await fetchProfile(session.user.id)
            if (isMounted) {
              setProfile(p)
            }
            saveSession(session)
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          clearSession()
        } else if (event === 'USER_UPDATED') {
          if (session?.user) {
            setUser(session.user)
            const p = await fetchProfile(session.user.id)
            if (isMounted) {
              setProfile(p)
            }
            saveSession(session)
          }
        }
      }
    )

    // Re-check session when window regains focus
    const handleFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user && !userRef.current) {
        setUser(session.user)
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      }
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      isMounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const register = async (userData) => {
    setError('')

    try {
      // Check if username is already taken (before creating auth user)
      const { data: takenUsername } = await supabase
        .from('users')
        .select('id')
        .eq('username', userData.username)
        .maybeSingle()

      if (takenUsername) {
        setError('Username is already taken. Please choose another.')
        return false
      }

      // 1. Sign up via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            username: userData.username,
            first_name: userData.firstName,
            last_name: userData.lastName,
          }
        }
      })

      if (authError) {
        setError(authError.message)
        return false
      }

      const userId = authData.user?.id
      if (!userId) {
        setError('Registration failed. Please try again.')
        return false
      }

      // 2. Insert profile row
      const { error: profileError } = await supabase.from('users').upsert({
        id: userId,
        username: userData.username,
        email: userData.email,
        password_hash: 'supabase-auth-managed',
        first_name: userData.firstName,
        last_name: userData.lastName,
        middle_initial: userData.middleInitial || null,
        contact_number: userData.contactNumber,
        age: parseInt(userData.age),
        municipality: userData.municipality,
        province: userData.province,
      }, { onConflict: 'id' })

      if (profileError) {
        console.error('Profile insert error:', profileError.message)
        setError(profileError.message)
        return false
      }

      // 3. Check if email confirmation is required
      if (authData.session) {
        // Auto-login successful (email confirmation disabled)
        setUser(authData.user)
        const p = await fetchProfile(userId)
        setProfile(p)
        // Save session backup
        saveSession(authData.session)
        return { success: true, requiresConfirmation: false }
      } else {
        // Email confirmation required
        return { success: true, requiresConfirmation: true }
      }
    } catch (err) {
      console.error('Registration error:', err)
      setError('An unexpected error occurred during registration.')
      return false
    }
  }

  const login = async (identifier, password) => {
    setError('')

    try {
      let email = identifier

      // If not an email, look up by username
      if (!identifier.includes('@')) {
        const { data: found, error: lookupError } = await supabase
          .from('users')
          .select('email')
          .eq('username', identifier)
          .maybeSingle()

        if (lookupError) {
          console.error('Username lookup error:', lookupError.message)
          setError('Could not look up username. Try logging in with email.')
          return false
        }
        if (!found) {
          setError('Username not found')
          return false
        }
        email = found.email
      }

      // Sign in with Supabase Auth
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        if (loginError.message.includes('Email not confirmed')) {
          setError('Please confirm your email before logging in.')
        } else if (loginError.message.includes('Invalid login credentials')) {
          setError('Invalid username/email or password')
        } else {
          setError(loginError.message)
        }
        return false
      }

      // Set session immediately (onAuthStateChange will also trigger)
      if (data.session?.user) {
        setUser(data.session.user)
        const p = await fetchProfile(data.session.user.id)
        setProfile(p)
        
        // Save session manually as backup
        saveSession(data.session)
      }

      return true
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred during login.')
      return false
    }
  }

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Logout error:', error.message)
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      // Clear manual session backup
      clearSession()
      // Always clear local state
      setUser(null)
      setProfile(null)
    }
  }

  const updateProfile = async (updates) => {
    if (!user) return false
    try {
      const { error: err } = await supabase
        .from('users')
        .update({
          first_name: updates.firstName,
          last_name: updates.lastName,
          email: updates.email,
          contact_number: updates.contactNumber,
          municipality: updates.municipality,
          province: updates.province,
        })
        .eq('id', user.id)

      if (err) {
        console.error('Error updating profile:', err.message)
        return false
      }
      const p = await fetchProfile(user.id)
      setProfile(p)
      return true
    } catch (err) {
      console.error('Update profile error:', err)
      return false
    }
  }

  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('Session refresh error:', error.message)
        return false
      }
      if (session?.user) {
        setUser(session.user)
        const p = await fetchProfile(session.user.id)
        setProfile(p)
        return true
      }
      return false
    } catch (err) {
      console.error('Refresh session error:', err)
      return false
    }
  }

  const combinedUser = profile
    ? {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        middleInitial: profile.middle_initial,
        contactNumber: profile.contact_number,
        age: profile.age,
        municipality: profile.municipality,
        province: profile.province,
      }
    : user
    ? {
        id: user.id,
        email: user.email,
        username: user.email.split('@')[0],
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        middleInitial: '',
        contactNumber: '',
        age: null,
        municipality: '',
        province: '',
      }
    : null

  return (
    <AuthContext.Provider
      value={{
        user: combinedUser,
        authUser: user,
        loading,
        error,
        setError,
        register,
        login,
        logout,
        updateProfile,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
