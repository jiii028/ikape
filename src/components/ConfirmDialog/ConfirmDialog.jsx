import { useEffect, useMemo, useState } from 'react'
import { X, AlertTriangle, Save, LogOut } from 'lucide-react'

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger' // 'danger', 'warning', or 'success'
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isLogoutPrompt = useMemo(() => {
    const text = `${title || ''} ${confirmText || ''}`.toLowerCase()
    return text.includes('logout') || text.includes('log out')
  }, [confirmText, title])

  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      await onConfirm()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const Icon = isLogoutPrompt ? LogOut : variant === 'success' ? Save : AlertTriangle

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className={`confirm-dialog confirm-dialog--${variant} ${isLogoutPrompt ? 'confirm-dialog--logout' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <button className="confirm-close" onClick={onClose} disabled={isSubmitting} aria-label="Close">
          <X size={18} />
        </button>
        
        <div className={`confirm-icon confirm-icon--${variant}`}>
          <Icon size={32} />
        </div>
        
        <h3 id="confirm-title" className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        {isLogoutPrompt && <p className="confirm-note">You can sign back in any time.</p>}
        
        <div className="confirm-actions">
          <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
            {cancelText}
          </button>
          <button
            className={`btn-confirm btn-confirm--${variant}`}
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Please wait...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
