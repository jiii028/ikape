import { supabase } from '../lib/supabase'

// Quick test to verify database connection and user data
export async function testDatabaseConnection() {
  console.log('=== DATABASE CONNECTION TEST ===')
  
  try {
    // Test 1: Check if we can connect to users table
    console.log('Test 1: Checking users table access...')
    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .limit(5)
    
    if (error) {
      console.error('❌ Cannot access users table:', error.message)
      console.error('Error details:', error)
    } else {
      console.log('✅ Users table accessible')
      console.log('Total users:', count)
      console.log('Sample users:', data)
    }
    
    // Test 2: Check current auth user
    console.log('\nTest 2: Checking current auth session...')
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError) {
      console.error('❌ Auth error:', authError.message)
    } else if (!session) {
      console.log('⚠️ No active session')
    } else {
      console.log('✅ Active session found')
      console.log('User ID:', session.user.id)
      console.log('Email:', session.user.email)
      
      // Test 3: Check if this user exists in users table
      console.log('\nTest 3: Checking if user profile exists...')
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
      
      if (profileError) {
        console.error('❌ Profile fetch error:', profileError.message)
        console.error('Error details:', profileError)
      } else if (!profile) {
        console.error('❌ User profile NOT found in database!')
        console.log('User needs to be added to users table')
      } else {
        console.log('✅ User profile found!')
        console.log('Profile:', profile)
      }
    }
    
  } catch (err) {
    console.error('❌ Test failed with exception:', err)
  }
  
  console.log('=== END DATABASE TEST ===')
}
