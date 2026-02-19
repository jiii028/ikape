import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Mail, Send, X } from 'lucide-react'
import './ForgotPasswordModal.css'

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  onSubmit,
  defaultEmail = '',
}) {
  const [email, setEmail] = useState(defaultEmail)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setEmail(defaultEmail || '')
    setSubmitting(false)
    setError('')
    setSuccess('')
  }, [isOpen, defaultEmail])

  useEffect(() => {
    if (!isOpen) return

    const onEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Please enter your account email address.')
      return
    }

    const isEmailFormatValid = /\S+@\S+\.\S+/.test(trimmedEmail)
    if (!isEmailFormatValid) {
      setError('Please enter a valid email address.')
      return
    }

    setSubmitting(true)
    setError('')

    const result = await onSubmit(trimmedEmail)

    if (result?.success) {
      setSuccess('Password reset link sent. Open the email link to continue to the reset page.')
    } else {
      setError(result?.error || 'Could not send reset link. Please try again.')
    }

    setSubmitting(false)
  }

  return (
    <div className="forgot-password-overlay" onClick={onClose}>
      <div className="forgot-password-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="forgot-password-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="forgot-password-header">
          <div className="forgot-password-icon">
            <KeyRound size={22} />
          </div>
          <h3>Forgot Password</h3>
          <p>Enter your email and we will send a password reset link.</p>
        </div>

        {success ? (
          <div className="forgot-password-success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="forgot-password-form">
            {error && (
              <div className="forgot-password-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <label htmlFor="forgot-password-email">Email Address</label>
            <div className="forgot-password-input-wrap">
              <Mail size={16} />
              <input
                id="forgot-password-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="forgot-password-actions">
              <button type="button" className="forgot-password-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="forgot-password-submit" disabled={submitting}>
                {submitting ? <Loader2 size={16} className="forgot-password-spin" /> : <Send size={16} />}
                <span>{submitting ? 'Sending...' : 'Send Reset Link'}</span>
              </button>
            </div>
          </form>
        )}

        {success && (
          <div className="forgot-password-actions forgot-password-actions--success">
            <button type="button" className="forgot-password-submit" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
