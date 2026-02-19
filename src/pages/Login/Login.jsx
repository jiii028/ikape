import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Sprout, Eye, EyeOff, Leaf, Coffee, Flower2, LogIn } from 'lucide-react'
import LoadingScreen from '../../components/LoadingScreen'
import './Login.css'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const { login, error, setError } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoggingIn(true)

    try {
      // Safety timeout: if login hangs (e.g. RLS-blocked query), recover after 15s
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      )

      const result = await Promise.race([
        login(identifier, password),
        timeoutPromise,
      ])

      if (result.success) {
        // Navigate based on the ACTUAL DB role returned
        if (result.role === 'admin') {
          navigate('/admin/dashboard', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
        return // keep loading screen during navigation
      }
    } catch (err) {
      if (err.message === 'timeout') {
        setError('Login is taking too long. Please check your connection and try again.')
      } else {
        console.error('Login error:', err)
        setError('An unexpected error occurred. Please try again.')
      }
    }

    // Always clear loading on failure
    setIsLoggingIn(false)
  }

  // Show loading screen during login transition
  if (isLoggingIn) {
    return <LoadingScreen message="Signing you in..." />
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <Sprout size={48} />
          <h1>IKAPE</h1>
          <p>Coffee Farm Management System</p>
        </div>
        <div className="auth-illustration">
          <div className="leaf leaf-1" aria-hidden="true"><Leaf /></div>
          <div className="leaf leaf-2" aria-hidden="true"><Coffee /></div>
          <div className="leaf leaf-3" aria-hidden="true"><Sprout /></div>
          <div className="leaf leaf-4" aria-hidden="true"><Flower2 /></div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container">
          <h2>Welcome Back</h2>
          <p className="auth-subtitle">Sign in to your account</p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Username or Email</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError('') }}
                placeholder="Enter your username or email"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-btn">
              <span className="auth-btn-content">
                <LogIn size={16} />
                Sign In
              </span>
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/register" onClick={() => setError('')}>Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
