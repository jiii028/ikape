import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import './FarmFormModal.css'

export default function FarmFormModal({ onClose, editData }) {
  const { setFarmInfo } = useFarm()
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
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const initialData = editData || { farmName: '', farmArea: '', elevation: '', plantVariety: '', overallTreeCount: '' }
    // Compare only the fields we care about (ignore id)
    const compare = (obj) => ({ farmName: obj.farmName, farmArea: obj.farmArea, elevation: obj.elevation, plantVariety: obj.plantVariety, overallTreeCount: obj.overallTreeCount })
    const hasChanges = JSON.stringify(compare(form)) !== JSON.stringify(compare(initialData))
    setIsDirty(hasChanges)
  }, [form, editData])

  const handleChange = (e) => {
    if (formError) setFormError('')
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.farmName || !form.farmArea) {
      setFormError('Farm Name and Farm Area are required.')
      return
    }
    setShowSaveConfirm(true)
  }

  const doSave = async () => {
    const result = await setFarmInfo(form)
    if (!result?.success) {
      setShowSaveConfirm(false)
      setFormError(result?.error || 'Unable to save farm details.')
      return
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
          {formError && <div className="modal-form-error">{formError}</div>}

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
              <label>Elevation (MASL)</label>
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
        isOpen={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={doSave}
        title={editData ? 'Update Farm?' : 'Register Farm?'}
        message={editData ? `Save changes to "${form.farmName}"?` : `Register "${form.farmName}" as your farm?`}
        confirmText={editData ? 'Update Farm' : 'Register'}
        cancelText="Go Back"
        variant="success"
      />

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
