import { X, AlertTriangle } from 'lucide-react'
import './ConfirmDialog.css'

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger' // 'danger' or 'warning'
}) {
  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={onClose}>
          <X size={18} />
        </button>
        
        <div className={`confirm-icon confirm-icon--${variant}`}>
          <AlertTriangle size={32} />
        </div>
        
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        
        <div className="confirm-actions">
          <button className="btn-cancel" onClick={onClose}>
            {cancelText}
          </button>
          <button className={`btn-confirm btn-confirm--${variant}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
