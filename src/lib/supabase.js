import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  )
}

// Create a dummy client if credentials are missing to prevent app crash
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      // Dummy supabase client that logs errors but doesn't crash
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signInWithPassword: () => Promise.reject(new Error('Supabase not configured')),
        signUp: () => Promise.reject(new Error('Supabase not configured')),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.reject(new Error('Supabase not configured')),
        updateUser: () => Promise.reject(new Error('Supabase not configured')),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }),
        insert: () => Promise.reject(new Error('Supabase not configured')),
        update: () => Promise.reject(new Error('Supabase not configured')),
        delete: () => Promise.reject(new Error('Supabase not configured')),
        upsert: () => Promise.reject(new Error('Supabase not configured')),
      }),
      rpc: () => Promise.reject(new Error('Supabase not configured')),
    }
