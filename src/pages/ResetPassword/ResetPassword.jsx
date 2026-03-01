import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Coffee,
  Eye,
  EyeOff,
  Flower2,
  KeyRound,
  Leaf,
  Loader2,
  Sprout,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [checkingLink, setCheckingLink] = useState(true)
  const [isRecoveryReady, setIsRecoveryReady] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    const resolveRecoveryState = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
      const hasRecoveryType = hashParams.get('type') === 'recovery'
      const hasAccessToken = Boolean(hashParams.get('access_token'))

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (!mounted) return

      if (sessionError) {
        setError('Unable to validate reset link. Please request a new one.')
        setCheckingLink(false)
        return
      }

      if (hasRecoveryType || hasAccessToken || session?.user) {
        setIsRecoveryReady(true)
      } else {
        setError('This reset link is invalid or expired. Request a new password reset email.')
      }

      setCheckingLink(false)
    }

    resolveRecoveryState()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryReady(true)
        setError('')
        setCheckingLink(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!password || !confirmPassword) {
      setError('Please complete both password fields.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message || 'Unable to update your password. Please try again.')
      setSaving(false)
      return
    }

    setSuccess(true)
    setSaving(false)

    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 1200)
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-logo-badge">
            <img src="/logo.png" alt="IKAPE logo" className="auth-logo-image" />
          </div>
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
        <div className="auth-form-container reset-password-container">
          <div className="reset-password-head">
            <div className="reset-password-icon">
              <KeyRound size={20} />
            </div>
            <h2>Reset Password</h2>
            <p className="auth-subtitle">Set a new password for your account.</p>
          </div>

          {checkingLink && (
            <div className="reset-password-state">
              <Loader2 size={16} className="reset-password-spin" />
              <span>Validating reset link...</span>
            </div>
          )}

          {!checkingLink && error && !isRecoveryReady && (
            <div className="reset-password-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!checkingLink && success && (
            <div className="reset-password-success">
              <CheckCircle2 size={16} />
              <span>Password updated successfully. Redirecting to login...</span>
            </div>
          )}

          {!checkingLink && isRecoveryReady && !success && (
            <form onSubmit={handleSubmit} className="auth-form">
              {error && (
                <div className="reset-password-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label>New Password</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <div className="password-input">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="auth-btn" disabled={saving}>
                {saving ? (
                  <span className="auth-btn-loading">
                    <span className="auth-btn-spinner"></span>
                    Updating Password...
                  </span>
                ) : (
                  'Save New Password'
                )}
              </button>
            </form>
          )}

          <p className="auth-switch reset-password-switch">
            Return to <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
