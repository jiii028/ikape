import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Sprout, Eye, EyeOff, CheckCircle, Leaf, Coffee, Flower2, LogIn } from 'lucide-react'
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
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    const age = parseInt(form.age)
    if (isNaN(age) || age < 18 || age > 120) {
      setError('Age must be between 18 and 120')
      return
    }
    setIsSubmitting(true)
    try {
      const result = await register(form)
      if (result && result.success) {
        if (result.requiresConfirmation) {
          setSuccessMessage('Registration successful! Please check your email to confirm your account before logging in.')
        } else {
          setSuccessMessage('Registration successful! You can now log in with your credentials.')
        }
      }
    } finally {
      setIsSubmitting(false)
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
          <div className="leaf leaf-1" aria-hidden="true"><Leaf /></div>
          <div className="leaf leaf-2" aria-hidden="true"><Coffee /></div>
          <div className="leaf leaf-3" aria-hidden="true"><Sprout /></div>
          <div className="leaf leaf-4" aria-hidden="true"><Flower2 /></div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container" style={{ maxWidth: 480 }}>
          {successMessage ? (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={56} color="#16a34a" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 8 }}>You're All Set!</h2>
              <div className="auth-success" style={{ textAlign: 'left' }}>
                {successMessage}
              </div>
              <button
                className="auth-btn"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => navigate('/login')}
              >
                <span className="auth-btn-content">
                  <LogIn size={16} />
                  Go to Login
                </span>
              </button>
            </div>
          ) : (
            <>
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

                <button type="submit" className="auth-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="auth-btn-loading">
                      <span className="auth-btn-spinner"></span>
                      Creating Account...
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account?{' '}
                <Link to="/login" onClick={() => setError('')}>Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
