import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Sprout, Eye, EyeOff } from 'lucide-react'
import '../Login/Login.css'

export default function Register() {
  const [form, setForm] = useState({
    lastName: '',
    firstName: '',
    middleInitial: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    contactNumber: '',
    age: '',
    municipality: '',
    province: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const { register, error, setError } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const required = ['lastName', 'firstName', 'username', 'email', 'password', 'contactNumber', 'age', 'municipality', 'province']
    for (const field of required) {
      if (!form[field]) {
        setError('Please fill in all required fields')
        return
      }
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    const result = await register(form)
    if (result && result.success) {
      if (result.requiresConfirmation) {
        // Email confirmation required
        alert('Registration successful! Please check your email to confirm your account before logging in.')
        navigate('/login')
      } else {
        // Auto-login successful
        navigate('/dashboard')
      }
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <Sprout size={48} />
          <h1>PAUL KALDI</h1>
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
        <div className="auth-form-container" style={{ maxWidth: 480 }}>
          <h2>Create Account</h2>
          <p className="auth-subtitle">Register to start managing your coffee farm</p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-row">
              <div className="form-group">
                <label>Last Name *</label>
                <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Dela Cruz" />
              </div>
              <div className="form-group">
                <label>First Name *</label>
                <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="Juan" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Middle Initial</label>
                <input name="middleInitial" value={form.middleInitial} onChange={handleChange} placeholder="M" maxLength={2} />
              </div>
              <div className="form-group">
                <label>Age *</label>
                <input name="age" type="number" value={form.age} onChange={handleChange} placeholder="30" min="18" max="99" />
              </div>
            </div>

            <div className="form-group">
              <label>Username *</label>
              <input name="username" value={form.username} onChange={handleChange} placeholder="juanfarmer" />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="juan@email.com" />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <div className="password-input">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
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
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
              />
            </div>

            <div className="form-group">
              <label>Contact Number *</label>
              <input name="contactNumber" value={form.contactNumber} onChange={handleChange} placeholder="09xxxxxxxxx" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Municipality/City *</label>
                <input name="municipality" value={form.municipality} onChange={handleChange} placeholder="Municipality" />
              </div>
              <div className="form-group">
                <label>Province *</label>
                <input name="province" value={form.province} onChange={handleChange} placeholder="Province" />
              </div>
            </div>

            <button type="submit" className="auth-btn">Create Account</button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/login" onClick={() => setError('')}>Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
