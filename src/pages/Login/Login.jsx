import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Sprout, Eye, EyeOff, Shield, Leaf, UserPlus, ArrowLeft } from 'lucide-react'
import LoadingScreen from '../../components/LoadingScreen'
import './Login.css'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginAs, setLoginAs] = useState('farmer') // 'farmer' or 'admin'
  const [showAdminRegister, setShowAdminRegister] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const { login, registerAdmin, error, setError } = useAuth()
  const navigate = useNavigate()

  // Admin registration form state
  const [adminForm, setAdminForm] = useState({
    lastName: '', firstName: '', middleInitial: '', username: '', email: '',
    password: '', confirmPassword: '', contactNumber: '', age: '',
    municipality: '', province: '',
  })
  const [regSuccess, setRegSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoggingIn(true)

    // Pass the selected role to login for STRICT verification
    const result = await login(identifier, password, loginAs)

    if (result.success) {
      // Navigate based on the ACTUAL DB role returned, not the toggle
      if (result.role === 'admin') {
        navigate('/admin/dashboard', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } else {
      setIsLoggingIn(false)
    }
  }

  const handleAdminFormChange = (e) => {
    setAdminForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleAdminRegister = async (e) => {
    e.preventDefault()
    const required = ['lastName', 'firstName', 'username', 'email', 'password', 'contactNumber', 'age', 'municipality', 'province']
    for (const field of required) {
      if (!adminForm[field]) {
        setError('Please fill in all required fields')
        return
      }
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (adminForm.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    const age = parseInt(adminForm.age)
    if (isNaN(age) || age < 18 || age > 120) {
      setError('Age must be between 18 and 120')
      return
    }

    const success = await registerAdmin(adminForm)
    if (success) {
      setRegSuccess(true)
      setTimeout(() => {
        setRegSuccess(false)
        setShowAdminRegister(false)
        setAdminForm({
          lastName: '', firstName: '', middleInitial: '', username: '', email: '',
          password: '', confirmPassword: '', contactNumber: '', age: '',
          municipality: '', province: '',
        })
      }, 2000)
    }
  }

  // Show farm loading screen during login transition
  if (isLoggingIn) {
    return <LoadingScreen message={loginAs === 'admin' ? 'Verifying admin credentials...' : 'Loading your farm dashboard...'} />
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
        <div className="auth-form-container" style={showAdminRegister ? { maxWidth: 480 } : {}}>

          {/* ===== ADMIN REGISTRATION FORM ===== */}
          {showAdminRegister ? (
            <>
              <button
                type="button"
                className="admin-back-btn"
                onClick={() => { setShowAdminRegister(false); setError(''); setRegSuccess(false) }}
              >
                <ArrowLeft size={16} /> Back to Login
              </button>
              <h2>Create Admin Account</h2>
              <p className="auth-subtitle">Register a new administrator account</p>

              {regSuccess && (
                <div className="auth-success">✅ Admin account created successfully! Redirecting to login...</div>
              )}
              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleAdminRegister} className="auth-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input name="lastName" value={adminForm.lastName} onChange={handleAdminFormChange} placeholder="Last Name" />
                  </div>
                  <div className="form-group">
                    <label>First Name *</label>
                    <input name="firstName" value={adminForm.firstName} onChange={handleAdminFormChange} placeholder="First Name" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Middle Initial</label>
                    <input name="middleInitial" value={adminForm.middleInitial} onChange={handleAdminFormChange} placeholder="M.I." maxLength={2} />
                  </div>
                  <div className="form-group">
                    <label>Age *</label>
                    <input name="age" type="number" value={adminForm.age} onChange={handleAdminFormChange} placeholder="30" min="18" max="120" />
                  </div>
                </div>

                <div className="form-group">
                  <label>Username *</label>
                  <input name="username" value={adminForm.username} onChange={handleAdminFormChange} placeholder="admin_username" />
                </div>

                <div className="form-group">
                  <label>Email *</label>
                  <input name="email" type="email" value={adminForm.email} onChange={handleAdminFormChange} placeholder="admin@email.com" />
                </div>

                <div className="form-group">
                  <label>Password *</label>
                  <div className="password-input">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={adminForm.password}
                      onChange={handleAdminFormChange}
                      placeholder="At least 6 characters"
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Confirm Password *</label>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={adminForm.confirmPassword}
                    onChange={handleAdminFormChange}
                    placeholder="Re-enter password"
                  />
                </div>

                <div className="form-group">
                  <label>Contact Number *</label>
                  <input name="contactNumber" value={adminForm.contactNumber} onChange={handleAdminFormChange} placeholder="09xxxxxxxxx" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Municipality/City *</label>
                    <input name="municipality" value={adminForm.municipality} onChange={handleAdminFormChange} placeholder="Municipality" />
                  </div>
                  <div className="form-group">
                    <label>Province *</label>
                    <input name="province" value={adminForm.province} onChange={handleAdminFormChange} placeholder="Province" />
                  </div>
                </div>

                <button type="submit" className="auth-btn auth-btn--admin">
                  🛡️ Create Admin Account
                </button>
              </form>
            </>
          ) : (
            /* ===== LOGIN FORM ===== */
            <>
              <h2>Welcome Back</h2>
              <p className="auth-subtitle">Sign in to your account</p>

              {/* Role Toggle */}
              <div className="role-toggle">
                <button
                  type="button"
                  className={`role-btn ${loginAs === 'farmer' ? 'role-btn--active' : ''}`}
                  onClick={() => { setLoginAs('farmer'); setError('') }}
                >
                  <Leaf size={18} />
                  <span>Farmer</span>
                </button>
                <button
                  type="button"
                  className={`role-btn ${loginAs === 'admin' ? 'role-btn--active role-btn--admin' : ''}`}
                  onClick={() => { setLoginAs('admin'); setError('') }}
                >
                  <Shield size={18} />
                  <span>Admin</span>
                </button>
              </div>

              {/* Role indicator */}
              <div className="role-indicator">
                {loginAs === 'admin' ? (
                  <p>🔒 Logging in as <strong>Administrator</strong> — your account must have admin privileges.</p>
                ) : (
                  <p>🌿 Logging in as <strong>Farmer</strong> — your account must be a registered farmer.</p>
                )}
              </div>

              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label>Username or Email</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setError('') }}
                    placeholder={loginAs === 'admin' ? 'Enter admin username' : 'Enter your username or email'}
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
                  {loginAs === 'admin' ? '🔒 Sign In as Admin' : '🌿 Sign In as Farmer'}
                </button>
              </form>

              {loginAs === 'farmer' ? (
                <p className="auth-switch">
                  Don't have an account?{' '}
                  <Link to="/register" onClick={() => setError('')}>Sign Up</Link>
                </p>
              ) : (
                <p className="auth-switch">
                  Need an admin account?{' '}
                  <button
                    type="button"
                    className="admin-register-link"
                    onClick={() => { setShowAdminRegister(true); setError('') }}
                  >
                    <UserPlus size={14} /> Create Admin Account
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
