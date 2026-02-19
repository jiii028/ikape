import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import '../FarmFormModal/FarmFormModal.css'

export default function ClusterFormModal({ onClose, editData }) {
  const { addCluster, updateCluster } = useFarm()
  const [form, setForm] = useState(
    editData || {
      clusterName: '',
      areaSize: '',
      plantCount: '',
      plantStage: 'seed-sapling',
    }
  )
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  useEffect(() => {
    // Track if form has been modified
    const initialData = editData || { clusterName: '', areaSize: '', plantCount: '', plantStage: 'seed-sapling' }
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialData)
    setIsDirty(hasChanges)
  }, [form, editData])

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.clusterName || !form.areaSize || !form.plantCount) return
    if (editData) {
      await updateCluster(editData.id, form)
    } else {
      await addCluster(form)
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
          <h3>{editData ? 'Edit Cluster' : 'Add New Cluster'}</h3>
          <button className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Cluster Name *</label>
            <input
              name="clusterName"
              value={form.clusterName}
              onChange={handleChange}
              placeholder="e.g. Section A - Hillside"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Area Size (hectares) *</label>
              <input
                name="areaSize"
                type="number"
                step="0.01"
                value={form.areaSize}
                onChange={handleChange}
                placeholder="e.g. 1.2"
                required
              />
            </div>
            <div className="form-group">
              <label>Plant Count *</label>
              <input
                name="plantCount"
                type="number"
                value={form.plantCount}
                onChange={handleChange}
                placeholder="e.g. 500"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Plant Stage *</label>
            <select name="plantStage" value={form.plantStage} onChange={handleChange} required>
              <option value="seed-sapling">Seed / Sapling</option>
              <option value="tree">Tree</option>
              <option value="flowering">Flowering / Fruit-bearing</option>
              <option value="ready-to-harvest">Ready to Harvest</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn-primary">
              {editData ? 'Update Cluster' : 'Add Cluster'}
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
