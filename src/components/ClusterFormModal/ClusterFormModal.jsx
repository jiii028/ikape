import { useMemo, useState } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'

const DEFAULT_CLUSTER_FORM = {
  clusterName: '',
  areaSize: '',
  plantCount: '',
  plantStage: 'seed-sapling',
}

export default function ClusterFormModal({ onClose, editData }) {
  const { farm, clusters, addCluster, updateCluster } = useFarm()
  const initialForm = useMemo(() => editData || DEFAULT_CLUSTER_FORM, [editData])
  const [form, setForm] = useState(initialForm)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [formError, setFormError] = useState('')

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm])

  const handleChange = (e) => {
    setFormError('')
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const validateClusterInputs = () => {
    if (!form.clusterName || form.areaSize === '' || form.plantCount === '') {
      return 'Please fill in all required fields.'
    }

    const inputArea = parseFloat(form.areaSize)
    const inputPlantCount = parseInt(form.plantCount, 10)

    if (!Number.isFinite(inputArea) || inputArea <= 0) {
      return 'Area size must be greater than 0.'
    }

    if (!Number.isInteger(inputPlantCount) || inputPlantCount <= 0) {
      return 'Plant count must be a whole number greater than 0.'
    }

    const otherClusters = clusters.filter((cluster) => cluster.id !== editData?.id)
    const usedArea = otherClusters.reduce((sum, cluster) => sum + (parseFloat(cluster.areaSize) || 0), 0)
    const usedPlantCount = otherClusters.reduce((sum, cluster) => sum + (parseInt(cluster.plantCount, 10) || 0), 0)

    const projectedArea = usedArea + inputArea
    const projectedPlantCount = usedPlantCount + inputPlantCount

    // Farm area is stored in hectares while cluster input is in square meters.
    const maxFarmAreaHa = parseFloat(farm?.farm_area)
    const maxFarmAreaSqm = Number.isFinite(maxFarmAreaHa) && maxFarmAreaHa > 0 ? maxFarmAreaHa * 10000 : null
    if (Number.isFinite(maxFarmAreaSqm) && projectedArea > maxFarmAreaSqm) {
      const remainingAreaSqm = Math.max(maxFarmAreaSqm - usedArea, 0)
      return `Area size exceeds your registered farm area. Remaining allocatable area: ${remainingAreaSqm.toFixed(2)} sqm.`
    }

    const maxTreeCount = parseInt(farm?.overall_tree_count, 10)
    if (Number.isInteger(maxTreeCount) && maxTreeCount > 0 && projectedPlantCount > maxTreeCount) {
      const remainingPlantCount = Math.max(maxTreeCount - usedPlantCount, 0)
      return `Plant count exceeds your registered tree count. Remaining allocatable plants: ${remainingPlantCount}.`
    }

    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validateClusterInputs()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setShowSaveConfirm(true)
  }

  const doSave = async () => {
    const validationError = validateClusterInputs()
    if (validationError) {
      setFormError(validationError)
      return
    }

    if (editData) {
      const result = await updateCluster(editData.id, form)
      if (!result?.success) {
        setShowSaveConfirm(false)
        setFormError(result?.error || 'Unable to update cluster.')
        return
      }
    } else {
      const result = await addCluster(form)
      if (!result?.success) {
        setShowSaveConfirm(false)
        setFormError(result?.error || 'Unable to add cluster.')
        return
      }
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
          {formError && <div className="modal-form-error">{formError}</div>}

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
              <label>Area Size (sqm) *</label>
              <input
                name="areaSize"
                type="number"
                step="0.01"
                min="0.01"
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
                min="1"
                step="1"
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
              <option value="seed-sapling">Sapling</option>
              <option value="tree">Tree</option>
              <option value="flowering">Flowering</option>
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
        isOpen={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={doSave}
        title={editData ? 'Update Cluster?' : 'Add Cluster?'}
        message={editData ? `Save changes to "${form.clusterName}"?` : `Add "${form.clusterName}" as a new cluster?`}
        confirmText={editData ? 'Update' : 'Add Cluster'}
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
