import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  saveUserSession,
  loadUserSession,
  clearUserSession,
  hasStoredSession,
} from '../lib/sessionStorage'

const AuthContext = createContext(null)

// Synchronously hydrate from localStorage so there's ZERO loading delay
function getInitialAuth() {
  const restored = loadUserSession()
  if (restored?.user && restored?.profile) {
    return { user: restored.user, profile: restored.profile }
  }
  return { user: null, profile: null }
}

export function AuthProvider({ children }) {
  const initial = getInitialAuth()
  const [user, setUser] = useState(initial.user)
  const [profile, setProfile] = useState(initial.profile)
  const [loading, setLoading] = useState(false) // never loading — instant render
  const [error, setError] = useState('')
  const userRef = useRef(initial.user)
  const isLoggingOutRef = useRef(false)

  // Keep ref in sync with user state
  useEffect(() => {
    userRef.current = user
  }, [user])

  // Fetch user profile from the users table
  const fetchProfile = async (userId) => {
    try {
      // Use a more aggressive timeout for profile fetching
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: null, timedOut: true }), 5000)
      )

      const fetchPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      const { data, error: err, timedOut } = await Promise.race([fetchPromise, timeoutPromise])

      if (timedOut) {
        console.warn('fetchProfile timed out after 5s - using cached profile')
        // Try to get profile from localStorage as fallback
        const cached = loadUserSession()
        return cached?.profile || null
      }

      if (err) {
        console.error('Error fetching profile:', err.message)
        // Try cached profile as fallback
        const cached = loadUserSession()
        return cached?.profile || null
      }

      if (!data) {
        console.warn('No profile found for user')
        // Try cached profile as fallback
        const cached = loadUserSession()
        return cached?.profile || null
      }

      return data
    } catch (error) {
      console.warn('fetchProfile failed:', error.message)
      // Try cached profile as fallback
      const cached = loadUserSession()
      return cached?.profile || null
    }
  }

  // ===== Session Initialization =====
  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      // If no stored session, we already set loading=false — just bail
      if (!hasStoredSession()) {
        console.log('🔑 No stored session — redirecting to login')
        if (isMounted) setLoading(false)
        return
      }

      try {
        // 1. Try Supabase auth session first
        console.log('🔄 Checking Supabase auth session...')
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('⚠️ getSession error:', sessionError.message)
        }

        if (session?.user) {
          console.log('✅ Supabase session found for:', session.user.email)
          if (isMounted) {
            setUser(session.user)
            const p = await fetchProfile(session.user.id)
            if (isMounted && p) {
              setProfile(p)
              saveUserSession(session.user, p)
            }
          }
        } else {
          // 2. Fallback to localStorage
          console.log('⚠️ No Supabase session — falling back to localStorage')
          const restored = loadUserSession()
          if (restored) {
            console.log('📦 Found stored session for user ID:', restored.user.id)
            // Try to re-validate role from DB
            let freshProfile = null
            try {
              freshProfile = await fetchProfile(restored.user.id)
            } catch (fetchErr) {
              console.warn('⚠️ fetchProfile threw error (likely RLS):', fetchErr.message)
            }

            if (freshProfile && isMounted) {
              console.log('✅ Session restored + re-validated for:', freshProfile.username, '| role:', freshProfile.role)
              setUser(restored.user)
              setProfile(freshProfile)
              saveUserSession(restored.user, freshProfile)
            } else if (restored.profile && isMounted) {
              // fetchProfile failed (RLS / network) but we have a cached profile
              // Use it as-is — this keeps the session alive for dev-bypass logins
              console.log('📦 Using cached profile from localStorage (DB unreachable):', restored.profile.username, '| role:', restored.profile.role)
              setUser(restored.user)
              setProfile(restored.profile)
            } else {
              console.log('❌ No valid session data available. Clearing session.')
              clearUserSession()
            }
          } else {
            console.log('🔑 No active session — user needs to log in')
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
        if (isMounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (isMounted) {
          console.log('🏁 Auth initialization complete, setting loading=false')
          setLoading(false)
        }
      }
    }

    // Safety timeout: if auth initialization hangs for more than 10s,
    // force loading=false to prevent infinite loading screen
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('⏰ Auth initialization timed out after 10s — forcing loading=false')
        setLoading(false)
      }
    }, 10000)

    initializeAuth().finally(() => clearTimeout(safetyTimeout))

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user)
            const p = await fetchProfile(session.user.id)
            if (isMounted && p) {
              setProfile(p)
              saveUserSession(session.user, p)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          clearUserSession()
        } else if (event === 'USER_UPDATED') {
          if (session?.user) {
            setUser(session.user)
            const p = await fetchProfile(session.user.id)
            if (isMounted) {
              setProfile(p)
            }
            if (p) saveUserSession(session.user, p)
          }
        }
      }
    )

    // Re-check session when window regains focus
    const handleFocus = async () => {
      // Skip if logging out to prevent fetchProfile timeout from blocking logout
      if (isLoggingOutRef.current) return
      
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
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Log currently logged in user
  useEffect(() => {
    if (profile) {
      console.log('👤 Current User Logged In:', {
        username: profile.username,
        role: profile.role || 'farmer',
      })
    }
  }, [profile])

  // ===== Registration =====
  const register = async (userData) => {
    setError('')
    console.log('[register] Starting registration for:', userData.email)

    try {
      // Check for existing email/username before attempting auth signup
      console.log('[register] Checking for existing email...')
      const { data: existingEmail, error: emailCheckError } = await supabase.from('users').select('id').eq('email', userData.email).maybeSingle()
      if (emailCheckError) {
        console.error('[register] Email check error:', emailCheckError)
      }
      if (existingEmail) { 
        const msg = 'An account with this email already exists.'
        setError(msg)
        return { success: false, error: msg } 
      }
      console.log('[register] Email check passed')

      console.log('[register] Checking for existing username...')
      const { data: takenUsername, error: usernameCheckError } = await supabase.from('users').select('id').eq('username', userData.username).maybeSingle()
      if (usernameCheckError) {
        console.error('[register] Username check error:', usernameCheckError)
      }
      if (takenUsername) { 
        const msg = 'Username is already taken.'
        setError(msg)
        return { success: false, error: msg } 
      }
      console.log('[register] Username check passed')

      console.log('[register] Attempting Supabase auth signup...')
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
        console.error('[register] Auth error:', authError)
        // Provide more specific error messages
        let msg = authError.message
        const errorMsg = authError.message.toLowerCase()
        if (authError.status === 429 || errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          msg = 'Too many registration attempts. Please wait a few minutes before trying again.'
        } else if (errorMsg.includes('email') || errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
          msg = 'This email is already registered in the authentication system. Please try logging in instead. If you forgot your password, use the Forgot Password link.'
        } else if (errorMsg.includes('password')) {
          msg = 'Password is too weak. Please use at least 6 characters with a mix of letters and numbers.'
        } else if (errorMsg.includes('valid')) {
          msg = 'Invalid email format. Please check your email address.'
        }
        setError(msg)
        return { success: false, error: msg } 
      }

      const userId = authData.user?.id
      if (!userId) { 
        const msg = 'Registration failed. No user ID returned.'
        setError(msg)
        return { success: false, error: msg } 
      }
      
      console.log('[register] Auth signup successful, userId:', userId)

      // Check if Supabase returned a fake session (email already exists in auth)
      const requiresConfirmation = !authData.session
      console.log('[register] Requires confirmation:', requiresConfirmation)

      console.log('[register] Inserting user profile...')
      const { error: profileError } = await supabase.from('users').insert({
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
        role: 'farmer',
      })

      if (profileError) { 
        console.error('[register] Profile insert error:', profileError)
        const msg = 'Error creating user profile: ' + profileError.message
        setError(msg)
        return { success: false, error: msg } 
      }
      
      console.log('[register] Registration successful!')
      return { success: true, requiresConfirmation }
    } catch (err) {
      console.error('[register] Unexpected error:', err)
      const msg = 'Unexpected error during registration: ' + (err.message || 'Unknown error')
      setError(msg)
      return { success: false, error: msg }
    }
  }

  // ===== Login =====
  const login = async (identifier, password) => {
    setError('')

    try {
      let email = identifier

      // Resolve username to email
      if (!identifier.includes('@')) {
        const { data: found, error: lookupError } = await supabase
          .from('users')
          .select('email')
          .eq('username', identifier)
          .maybeSingle()

        if (lookupError) {
          setError('Could not look up username. Try using your email.')
          return { success: false }
        }
        if (!found) {
          setError('Username not found')
          return { success: false }
        }
        email = found.email
      }

      // STEP 1: Look up profile BEFORE authenticating
      const { data: profileData, error: profileLookupErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (profileLookupErr || !profileData) {
        setError('No account found with that email/username.')
        return { success: false }
      }

      const dbRole = profileData.role || 'farmer'

      // Authenticate with Supabase
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        setError('Invalid credentials. Please check your username/email and password.')
        return { success: false }
      }

      // Supabase auth succeeded
      const authUser = (await supabase.auth.getUser()).data.user
      if (authUser) {
        setUser(authUser)
        setProfile(profileData)
        saveUserSession(authUser, profileData)
      }

      return { success: true, role: dbRole }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred during login.')
      return { success: false }
    }
  }

  // ===== Forgot Password =====
  const requestPasswordReset = async (email) => {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail) {
      return { success: false, error: 'Please enter your email address.' }
    }

    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      })

      if (resetError) {
        console.error('Password reset error:', resetError.message)
        return { success: false, error: resetError.message || 'Unable to send reset link.' }
      }

      return { success: true }
    } catch (err) {
      console.error('Password reset request failed:', err)
      return { success: false, error: 'Unable to send reset link right now. Please try again.' }
    }
  }

  // ===== Logout =====
  const logout = async () => {
    // Set flag to prevent fetchProfile from running during logout
    isLoggingOutRef.current = true
    
    // Clear local state FIRST so route guards react instantly
    setUser(null)
    setProfile(null)
    clearUserSession()
    
    // Then attempt Supabase signOut (non-blocking, may fail for dev-bypass sessions)
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('Supabase signOut failed (expected for dev-bypass sessions):', e.message)
    } finally {
      // Reset flag after logout completes
      isLoggingOutRef.current = false
    }
  }

  // ===== Update Profile =====
  const updateProfile = async (updates) => {
    if (!user) return false
    try {
      const { error: err } = await supabase
        .from('users')
        .update({
          first_name: updates.firstName,
          middle_initial: updates.middleInitial,
          last_name: updates.lastName,
          age: updates.age ? Number(updates.age) : null,
          email: updates.email,
          contact_number: updates.contactNumber,
          municipality: updates.municipality,
          province: updates.province,
        })
        .eq('id', user.id)

      if (err) { console.error('Error updating profile:', err.message); return false }

      const p = await fetchProfile(user.id)
      setProfile(p)
      if (p) saveUserSession(user, p)
      return true
    } catch (err) {
      console.error('Update profile error:', err)
      return false
    }
  }

  // ===== Combined User Object =====
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
      role: profile.role || 'farmer',
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
        requestPasswordReset,
        logout,
        updateProfile,
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
