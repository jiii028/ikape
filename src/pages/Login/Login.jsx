import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Sprout, Eye, EyeOff } from 'lucide-react'
import './Login.css'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, error, setError } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) {
      setError('Please fill in all fields')
      return
    }
    const success = await login(identifier, password)
    if (success) {
      navigate('/dashboard')
    }
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
          <div className="leaf leaf-1">🌿</div>
          <div className="leaf leaf-2">☕</div>
          <div className="leaf leaf-3">🌱</div>
          <div className="leaf leaf-4">🍃</div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container">
          <h2>Welcome Back</h2>
          <p className="auth-subtitle">Sign in to manage your coffee farm</p>

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

            <button type="submit" className="auth-btn">Sign In</button>
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
