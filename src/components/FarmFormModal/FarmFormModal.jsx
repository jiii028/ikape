import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import './FarmFormModal.css'

export default function FarmFormModal({ onClose, editData }) {
  const { addFarm, updateFarm } = useFarm()
  const [form, setForm] = useState(
    editData || {
      farmName: '',
      farmArea: '',
      elevation: '',
      plantVariety: '',
      overallTreeCount: '',
    }
  )
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  useEffect(() => {
    const initialData = editData || { farmName: '', farmArea: '', elevation: '', plantVariety: '', overallTreeCount: '' }
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialData)
    setIsDirty(hasChanges)
  }, [form, editData])

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.farmName || !form.farmArea) return
    if (editData) {
      updateFarm(editData.id, form)
    } else {
      addFarm(form)
    }
    onClose()
  }

  const handleClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editData ? 'Edit Farm' : 'Register New Farm'}</h3>
          <button className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Farm Name *</label>
            <input
              name="farmName"
              value={form.farmName}
              onChange={handleChange}
              placeholder="e.g. Mountain View Coffee Farm"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Farm Area (hectares) *</label>
              <input
                name="farmArea"
                type="number"
                step="0.01"
                value={form.farmArea}
                onChange={handleChange}
                placeholder="e.g. 5.5"
                required
              />
            </div>
            <div className="form-group">
              <label>Elevation (meters)</label>
              <input
                name="elevation"
                type="number"
                value={form.elevation}
                onChange={handleChange}
                placeholder="e.g. 800"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Plant Variety</label>
              <select name="plantVariety" value={form.plantVariety} onChange={handleChange}>
                <option value="">Select variety</option>
                <option value="Arabica">Arabica</option>
                <option value="Robusta">Robusta</option>
                <option value="Liberica">Liberica</option>
                <option value="Excelsa">Excelsa</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div className="form-group">
              <label>Overall Tree Count</label>
              <input
                name="overallTreeCount"
                type="number"
                value={form.overallTreeCount}
                onChange={handleChange}
                placeholder="e.g. 2000"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editData ? 'Update Farm' : 'Register Farm'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={onClose}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to close this form? All changes will be lost."
        confirmText="Discard"
        cancelText="Keep Editing"
        variant="warning"
      />
    </div>
  )
}
