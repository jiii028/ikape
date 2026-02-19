import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X, Save } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import '../FarmFormModal/FarmFormModal.css'

const STAGE_FIELDS = {
  'seed-sapling': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'text' },
    { name: 'fertilizerFrequency', label: 'Fertilizer Application Frequency', type: 'text' },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'text' },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'text' },
    { name: 'pesticideFrequency', label: 'Pesticide Application Frequency', type: 'text' },
    { name: 'monthlyTemperature', label: 'Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH', type: 'number', step: '0.1' },
  ],
  'tree': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'text' },
    { name: 'fertilizerFrequency', label: 'Fertilizer Application Frequency', type: 'text' },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'text' },
    { name: 'pesticideFrequency', label: 'Pesticide & Application Frequency', type: 'text' },
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Coffee Yield (kg)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: ['Yes', 'No'] },
    { name: 'monthlyTemperature', label: 'Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH', type: 'number', step: '0.1' },
  ],
  'flowering': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'text' },
    { name: 'fertilizerFrequency', label: 'Fertilizer Application Frequency', type: 'text' },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'text' },
    { name: 'pesticideFrequency', label: 'Pesticide & Application Frequency', type: 'text' },
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Coffee Yield (kg)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: ['Yes', 'No'] },
    { name: 'monthlyTemperature', label: 'Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH', type: 'number', step: '0.1' },
    { name: 'estimatedFloweringDate', label: 'Estimated Flowering Date', type: 'date' },
  ],
  'ready-to-harvest': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'text' },
    { name: 'fertilizerFrequency', label: 'Fertilizer Application Frequency', type: 'text' },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'text' },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'text' },
    { name: 'pesticideFrequency', label: 'Pesticide Application Frequency', type: 'text' },
    { name: 'harvestDate', label: 'Harvest Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Yield (kg)', type: 'number' },
    { name: 'predictedYield', label: 'Predicted Yield (kg)', type: 'number' },
    { name: 'harvestSeason', label: 'Date & Season of Harvest', type: 'text' },
    { name: 'currentYield', label: 'Current Harvest (kg)', type: 'number' },
    { name: 'gradeFine', label: 'Grade: Fine (%)', type: 'number' },
    { name: 'gradePremium', label: 'Grade: Premium (%)', type: 'number' },
    { name: 'gradeCommercial', label: 'Grade: Commercial (%)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'monthlyTemperature', label: 'Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH', type: 'number', step: '0.1' },
    { name: 'shadeTrees', label: 'Shade Trees', type: 'select', options: ['Yes', 'No'] },
    { name: 'estimatedHarvestDate', label: 'Estimated Harvest Date', type: 'date' },
    // Pre-Harvest fields
    { name: 'preLastHarvestDate', label: 'Previous: Last Harvest Date', type: 'date' },
    { name: 'preTotalTrees', label: 'Previous: Total Trees', type: 'number' },
    { name: 'preYieldKg', label: 'Previous: Yielded Coffee (kg)', type: 'number' },
    { name: 'preGradeFine', label: 'Previous: Fine Grade (kg)', type: 'number' },
    { name: 'preGradePremium', label: 'Previous: Premium Grade (kg)', type: 'number' },
    { name: 'preGradeCommercial', label: 'Previous: Commercial Grade (kg)', type: 'number' },
    // Post-Harvest fields
    { name: 'postCurrentYield', label: 'Predicted: Yield (kg)', type: 'number' },
    { name: 'postGradeFine', label: 'Predicted: Fine (%)', type: 'number' },
    { name: 'postGradePremium', label: 'Predicted: Premium (%)', type: 'number' },
    { name: 'postGradeCommercial', label: 'Predicted: Commercial (%)', type: 'number' },
    { name: 'defectCount', label: 'Post-Harvest: Defect Count', type: 'number' },
    { name: 'beanMoisture', label: 'Post-Harvest: Bean Moisture Content (%)', type: 'number' },
    { name: 'beanScreenSize', label: 'Post-Harvest: Bean Screen Size', type: 'text' },
  ],
}

export default function ClusterDetailModal({ cluster, onClose }) {
  const { updateCluster } = useFarm()
  const fields = STAGE_FIELDS[cluster.plantStage] || STAGE_FIELDS['seed-sapling']
  const [form, setForm] = useState(() => {
    const initial = {}
    fields.forEach((f) => {
      initial[f.name] = cluster.stageData?.[f.name] || ''
    })
    return initial
  })
  const [initialForm, setInitialForm] = useState(() => {
    const initial = {}
    fields.forEach((f) => {
      initial[f.name] = cluster.stageData?.[f.name] || ''
    })
    return initial
  })
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  useEffect(() => {
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm)
    setIsDirty(hasChanges)
  }, [form, initialForm])

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    await updateCluster(cluster.id, { stageData: form })
    onClose()
  }

  const handleClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }

  // Group fields into sections for ready-to-harvest
  const isHarvest = cluster.plantStage === 'ready-to-harvest'
  const mainFields = isHarvest ? fields.filter((f) => !f.name.startsWith('pre') && !f.name.startsWith('post') && !['defectCount', 'beanMoisture', 'beanScreenSize'].includes(f.name)) : fields
  const preFields = isHarvest ? fields.filter((f) => f.name.startsWith('pre')) : []
  const postFields = isHarvest ? fields.filter((f) => f.name.startsWith('post') || ['defectCount', 'beanMoisture', 'beanScreenSize'].includes(f.name)) : []

  const renderField = (field) => (
    <div className="form-group" key={field.name}>
      <label>{field.label}</label>
      {field.type === 'select' ? (
        <select name={field.name} value={form[field.name]} onChange={handleChange}>
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          name={field.name}
          type={field.type}
          step={field.step}
          value={form[field.name]}
          onChange={handleChange}
          placeholder={field.label}
        />
      )}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{cluster.clusterName} — Data Entry</h3>
          <button className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            {mainFields.map(renderField)}
          </div>

          {preFields.length > 0 && (
            <>
              <div className="form-section-title">Previous Harvest Data</div>
              <div className="form-row" style={{ flexWrap: 'wrap' }}>
                {preFields.map(renderField)}
              </div>
            </>
          )}

          {postFields.length > 0 && (
            <>
              <div className="form-section-title">Predicted Harvest Data</div>
              <div className="form-row" style={{ flexWrap: 'wrap' }}>
                {postFields.map(renderField)}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn-primary">
              <Save size={16} /> Save Data
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
