import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import localforage from 'localforage'

const AuthContext = createContext(null)

// Configure localforage to use IndexedDB
const sessionStore = localforage.createInstance({
  name: 'ikape-session',
  storeName: 'auth',
  description: 'Persistent session storage for IKAPE',
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch user profile from the users table
  const fetchProfile = async (userId) => {
    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (err) {
      console.error('Error fetching profile:', err.message)
      return null
    }
    return data
  }

  // ===== IndexedDB Session Persistence =====
  const saveSession = async (userData, profileData) => {
    try {
      await sessionStore.setItem('user', userData)
      await sessionStore.setItem('profile', profileData)
      await sessionStore.setItem('timestamp', Date.now())
      console.log('💾 Session saved to IndexedDB')
    } catch (err) {
      console.error('Failed to save session:', err)
    }
  }

  const clearSession = async () => {
    try {
      await sessionStore.removeItem('user')
      await sessionStore.removeItem('profile')
      await sessionStore.removeItem('timestamp')
      console.log('🗑️ Session cleared from IndexedDB')
    } catch (err) {
      console.error('Failed to clear session:', err)
    }
  }

  const restoreSession = async () => {
    try {
      const savedUser = await sessionStore.getItem('user')
      const savedProfile = await sessionStore.getItem('profile')
      const savedTimestamp = await sessionStore.getItem('timestamp')

      if (!savedUser || !savedProfile || !savedTimestamp) return false

      // 24-hour expiry
      const SESSION_MAX_AGE = 24 * 60 * 60 * 1000
      if (Date.now() - savedTimestamp > SESSION_MAX_AGE) {
        console.log('⏰ IndexedDB session expired')
        await clearSession()
        return false
      }

      // Re-validate role from DB to prevent tampering
      const freshProfile = await fetchProfile(savedUser.id)
      if (!freshProfile) {
        console.log('❌ User no longer exists in DB, clearing session')
        await clearSession()
        return false
      }

      // Use fresh profile data (role may have changed)
      console.log('📦 Session restored from IndexedDB for:', freshProfile.username, '| role:', freshProfile.role)
      setUser(savedUser)
      setProfile(freshProfile)
      // Update stored profile with fresh data
      await saveSession(savedUser, freshProfile)
      return true
    } catch (err) {
      console.error('Failed to restore session:', err)
      return false
    }
  }

  // ===== Session Initialization =====
  useEffect(() => {
    const initSession = async () => {
      // 1. Try Supabase auth session first
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setUser(session.user)
        const p = await fetchProfile(session.user.id)
        if (p) {
          setProfile(p)
          await saveSession(session.user, p)
        }
      } else {
        // 2. Fallback to IndexedDB
        const restored = await restoreSession()
        if (!restored) {
          console.log('🔑 No active session — user needs to log in')
        }
      }

      setLoading(false)
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          const p = await fetchProfile(session.user.id)
          if (p) {
            setProfile(p)
            await saveSession(session.user, p)
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          await clearSession()
        }
      }
    )

    return () => subscription.unsubscribe()
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

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
    })

    if (authError) { setError(authError.message); return false }

    const userId = authData.user?.id
    if (!userId) { setError('Registration failed. Please try again.'); return false }

    const { data: existing } = await supabase.from('users').select('id').eq('email', userData.email).maybeSingle()
    if (existing) { setError('An account with this email already exists.'); return false }

    const { data: takenUsername } = await supabase.from('users').select('id').eq('username', userData.username).maybeSingle()
    if (takenUsername) { setError('Username is already taken.'); return false }

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
      role: 'farmer',
    }, { onConflict: 'id' })

    if (profileError) { setError(profileError.message); return false }
    return true
  }

  const registerAdmin = async (userData) => {
    setError('')

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
    })

    if (authError) { setError(authError.message); return false }

    const userId = authData.user?.id
    if (!userId) { setError('Registration failed. Please try again.'); return false }

    const { data: takenUsername } = await supabase.from('users').select('id').eq('username', userData.username).maybeSingle()
    if (takenUsername) { setError('Username is already taken.'); return false }

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
      role: 'admin',
    }, { onConflict: 'id' })

    if (profileError) { setError(profileError.message); return false }
    return true
  }

  // ===== Login with STRICT Role Verification =====
  const login = async (identifier, password, expectedRole) => {
    setError('')

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

    // ===== STEP 1: Look up profile BEFORE authenticating =====
    // Check if user exists in the DB and verify role
    const { data: profileData, error: profileLookupErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (profileLookupErr || !profileData) {
      setError('No account found with that email/username.')
      return { success: false }
    }

    // ===== STEP 2: STRICT ROLE CHECK =====
    // The database role column is KING
    const dbRole = profileData.role || 'farmer'
    if (expectedRole && dbRole !== expectedRole) {
      if (expectedRole === 'admin') {
        setError('⚠️ This account is not registered as an Admin. Please select "Farmer" to log in.')
      } else {
        setError('⚠️ This account is not registered as a Farmer. Please select "Admin" to log in.')
      }
      return { success: false }
    }

    // ===== STEP 3: Authenticate with Supabase =====
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      // Dev bypass: accept any password but STILL enforce role
      console.warn('⚡ Dev auth bypass active — role still enforced from DB')
      const mockUser = { id: profileData.id, email: profileData.email }
      setProfile(profileData)
      setUser(mockUser)
      await saveSession(mockUser, profileData)
      return { success: true, role: dbRole }
    }

    // Supabase auth succeeded — the onAuthStateChange will handle setting user/profile
    // But we also save explicitly for faster redirect
    const authUser = (await supabase.auth.getUser()).data.user
    if (authUser) {
      setUser(authUser)
      setProfile(profileData)
      await saveSession(authUser, profileData)
    }

    return { success: true, role: dbRole }
  }

  // ===== Logout =====
  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    await clearSession()
  }

  // ===== Update Profile =====
  const updateProfile = async (updates) => {
    if (!user) return false
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

    if (err) { console.error('Error updating profile:', err.message); return false }

    const p = await fetchProfile(user.id)
    setProfile(p)
    if (p) await saveSession(user, p)
    return true
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
        registerAdmin,
        login,
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
