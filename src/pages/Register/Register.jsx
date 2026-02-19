import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Coffee,
  Eye,
  EyeOff,
  Flower2,
  Leaf,
  Loader2,
  Sprout,
} from 'lucide-react'
import '../Login/Login.css'
import './Register.css'

const REQUIRED_FIELDS = [
  'lastName',
  'firstName',
  'username',
  'email',
  'password',
  'confirmPassword',
  'contactNumber',
  'age',
  'municipality',
  'province',
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_REGEX = /^[a-z0-9_]+$/
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const CONTACT_REGEX = /^09\d{9}$/

const initialFormState = {
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
}

const titleCaseWords = (input) => {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

const sanitizeValue = (name, value) => {
  switch (name) {
    case 'firstName':
    case 'lastName':
    case 'municipality':
    case 'province':
      return value.replace(/[^A-Za-z .'-]/g, '').replace(/\s{2,}/g, ' ')
    case 'middleInitial':
      return value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2)
    case 'username':
      return value.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 20)
    case 'email':
      return value.replace(/\s/g, '').toLowerCase()
    case 'contactNumber':
      return value.replace(/\D/g, '').slice(0, 11)
    case 'age':
      return value.replace(/\D/g, '').slice(0, 3)
    default:
      return value
  }
}

const getFieldError = (name, value, form) => {
  const trimmed = typeof value === 'string' ? value.trim() : value
  const isRequired = REQUIRED_FIELDS.includes(name)

  if (isRequired && !trimmed) return 'This field is required.'

  switch (name) {
    case 'firstName':
    case 'lastName':
      if (trimmed && !NAME_REGEX.test(trimmed)) return 'Use letters, spaces, apostrophes, and hyphens only.'
      if (trimmed && trimmed.length < 2) return 'Must be at least 2 characters.'
      return ''
    case 'middleInitial':
      if (!trimmed) return ''
      if (!/^[A-Z]{1,2}$/.test(trimmed)) return 'Use 1-2 letters only.'
      return ''
    case 'username':
      if (!USERNAME_REGEX.test(trimmed)) return 'Use lowercase letters, numbers, and underscore only.'
      if (trimmed.length < 4) return 'Username must be at least 4 characters.'
      if (trimmed.length > 20) return 'Username must be at most 20 characters.'
      return ''
    case 'email':
      if (!EMAIL_REGEX.test(trimmed)) return 'Enter a valid email address.'
      return ''
    case 'password':
      if (!PASSWORD_REGEX.test(value)) return 'Use at least 8 characters with letters and numbers.'
      return ''
    case 'confirmPassword':
      if (value !== form.password) return 'Passwords do not match.'
      return ''
    case 'contactNumber':
      if (!CONTACT_REGEX.test(trimmed)) return 'Use 11 digits starting with 09.'
      return ''
    case 'age': {
      const numericAge = Number.parseInt(trimmed, 10)
      if (Number.isNaN(numericAge) || numericAge < 18 || numericAge > 120) return 'Age must be between 18 and 120.'
      return ''
    }
    case 'municipality':
    case 'province':
      if (trimmed && !NAME_REGEX.test(trimmed)) return 'Use letters, spaces, apostrophes, and hyphens only.'
      if (trimmed && trimmed.length < 2) return 'Must be at least 2 characters.'
      return ''
    default:
      return ''
  }
}

export default function Register() {
  const [form, setForm] = useState(initialFormState)
  const [fieldErrors, setFieldErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [redirectMessage, setRedirectMessage] = useState('')
  const redirectTimerRef = useRef(null)
  const { register, logout, error, setError } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  const redirectToLogin = (message) => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current)
      redirectTimerRef.current = null
    }

    // Keep "extra authentication" behavior by forcing login screen after registration.
    Promise.resolve(logout()).catch((logoutError) => {
      console.warn('Logout before login redirect failed:', logoutError)
    })

    navigate('/login', {
      replace: true,
      state: { registerSuccess: message },
    })
  }

  const updateFieldError = (name, nextValue, nextForm) => {
    const nextError = getFieldError(name, nextValue, nextForm)
    setFieldErrors((prev) => {
      const updated = { ...prev }
      if (nextError) {
        updated[name] = nextError
      } else {
        delete updated[name]
      }
      return updated
    })
  }

  const handleChange = (event) => {
    const { name } = event.target
    const sanitizedValue = sanitizeValue(name, event.target.value)

    setForm((prev) => {
      const nextForm = { ...prev, [name]: sanitizedValue }
      updateFieldError(name, sanitizedValue, nextForm)
      if (name === 'password' && nextForm.confirmPassword) {
        updateFieldError('confirmPassword', nextForm.confirmPassword, nextForm)
      }
      return nextForm
    })

    setError('')
  }

  const handleBlur = (event) => {
    const { name } = event.target
    updateFieldError(name, form[name], form)
  }

  const validateForm = (formData) => {
    const nextErrors = {}
    const allFields = [...REQUIRED_FIELDS, 'middleInitial']

    allFields.forEach((field) => {
      const message = getFieldError(field, formData[field], formData)
      if (message) {
        nextErrors[field] = message
      }
    })

    return nextErrors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsRedirecting(false)
    setRedirectMessage('')

    const normalizedForm = {
      ...form,
      firstName: titleCaseWords(form.firstName),
      lastName: titleCaseWords(form.lastName),
      municipality: titleCaseWords(form.municipality),
      province: titleCaseWords(form.province),
      middleInitial: form.middleInitial.trim().toUpperCase(),
      username: form.username.trim().toLowerCase(),
      email: form.email.trim().toLowerCase(),
      contactNumber: form.contactNumber.trim(),
      age: form.age.trim(),
    }

    const errors = validateForm(normalizedForm)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError(errors[Object.keys(errors)[0]])
      return
    }

    setIsSubmitting(true)
    setForm(normalizedForm)
    setFieldErrors({})

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 20000)
      )
      const result = await Promise.race([register(normalizedForm), timeoutPromise])

      if (result?.success) {
        const message = result.requiresConfirmation
          ? 'Registration successful! Please check your email to confirm your account before logging in.'
          : 'Registration successful! You can now log in with your credentials.'
        setRedirectMessage(message)
        setIsRedirecting(true)
        redirectTimerRef.current = setTimeout(() => {
          redirectToLogin(message)
        }, 1300)
      } else {
        setError(error || 'Account registration was not successful. Please review your details and try again.')
      }
    } catch (submitError) {
      console.error('Registration submit failed:', submitError)
      if (submitError.message === 'timeout') {
        setError('Registration timed out. Please check your connection and try again.')
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const getInputClassName = (field) => (
    fieldErrors[field] ? 'register-input register-input--error' : 'register-input'
  )

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
        <div className="auth-form-container register-form-container">
          <div className="register-header">
            <h2>Create Account</h2>
            <p className="auth-subtitle register-subtitle">Register to start managing your coffee farm</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form register-form" noValidate>
            <section className="register-section register-section--half">
              <div className="register-section-title">Personal Details</div>
              <div className="register-grid register-grid--two">
                <div className="form-group">
                  <label>Last Name *</label>
                  <input
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Dela Cruz"
                    autoComplete="family-name"
                    className={getInputClassName('lastName')}
                  />
                  {fieldErrors.lastName && <p className="register-field-error">{fieldErrors.lastName}</p>}
                </div>
                <div className="form-group">
                  <label>First Name *</label>
                  <input
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Juan"
                    autoComplete="given-name"
                    className={getInputClassName('firstName')}
                  />
                  {fieldErrors.firstName && <p className="register-field-error">{fieldErrors.firstName}</p>}
                </div>
                <div className="form-group">
                  <label>Middle Initial</label>
                  <input
                    name="middleInitial"
                    value={form.middleInitial}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="M"
                    maxLength={2}
                    autoComplete="additional-name"
                    className={getInputClassName('middleInitial')}
                  />
                  {fieldErrors.middleInitial && <p className="register-field-error">{fieldErrors.middleInitial}</p>}
                </div>
                <div className="form-group">
                  <label>Age *</label>
                  <input
                    name="age"
                    type="text"
                    value={form.age}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="30"
                    inputMode="numeric"
                    autoComplete="bday-year"
                    className={getInputClassName('age')}
                  />
                  {fieldErrors.age && <p className="register-field-error">{fieldErrors.age}</p>}
                </div>
              </div>
            </section>

            <section className="register-section register-section--half">
              <div className="register-section-title">Account Credentials</div>
              <div className="register-grid register-grid--two">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="juanfarmer"
                    autoComplete="username"
                    className={getInputClassName('username')}
                  />
                  {fieldErrors.username && <p className="register-field-error">{fieldErrors.username}</p>}
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="juan@email.com"
                    autoComplete="email"
                    className={getInputClassName('email')}
                  />
                  {fieldErrors.email && <p className="register-field-error">{fieldErrors.email}</p>}
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <div className="password-input">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="At least 8 characters with letters and numbers"
                      autoComplete="new-password"
                      className={getInputClassName('password')}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="register-password-hint">Use at least 8 characters with letters and numbers.</p>
                  {fieldErrors.password && <p className="register-field-error">{fieldErrors.password}</p>}
                </div>
                <div className="form-group">
                  <label>Confirm Password *</label>
                  <div className="password-input">
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      className={getInputClassName('confirmPassword')}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="register-field-error">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>
            </section>

            <section className="register-section register-section--full">
              <div className="register-section-title">Contact and Location</div>
              <div className="register-grid register-grid--two">
                <div className="form-group">
                  <label>Contact Number *</label>
                  <input
                    name="contactNumber"
                    value={form.contactNumber}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="09xxxxxxxxx"
                    autoComplete="tel"
                    inputMode="numeric"
                    className={getInputClassName('contactNumber')}
                  />
                  {fieldErrors.contactNumber && <p className="register-field-error">{fieldErrors.contactNumber}</p>}
                </div>
                <div className="form-group">
                  <label>Municipality/City *</label>
                  <input
                    name="municipality"
                    value={form.municipality}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Municipality"
                    autoComplete="address-level2"
                    className={getInputClassName('municipality')}
                  />
                  {fieldErrors.municipality && <p className="register-field-error">{fieldErrors.municipality}</p>}
                </div>
                <div className="form-group">
                  <label>Province *</label>
                  <input
                    name="province"
                    value={form.province}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Province"
                    autoComplete="address-level1"
                    className={getInputClassName('province')}
                  />
                  {fieldErrors.province && <p className="register-field-error">{fieldErrors.province}</p>}
                </div>
              </div>
            </section>

            <button type="submit" className="auth-btn register-submit-btn" disabled={isSubmitting || isRedirecting}>
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

          <p className="auth-switch register-switch">
            Already have an account?{' '}
            <Link to="/login" onClick={() => setError('')}>Sign In</Link>
          </p>
        </div>
      </div>

      {isRedirecting && (
        <div className="register-redirect-overlay">
          <div className="register-redirect-modal" role="dialog" aria-modal="true">
            <div className="register-redirect-spinner-wrap">
              <Loader2 size={26} className="register-redirect-spinner" />
            </div>
            <h3>Account Created</h3>
            <p>{redirectMessage}</p>
            <span className="register-redirect-caption">Redirecting to login for authentication...</span>
            <button
              type="button"
              className="register-redirect-btn"
              onClick={() => redirectToLogin(redirectMessage)}
            >
              Continue to Login
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
