import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { X, Save } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import '../FarmFormModal/FarmFormModal.css'

const PRUNING_FUTURE_DATE_ERROR = 'Last Pruned Date cannot be set to a future date.'

function getTodayDateValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const VARIETY_OPTIONS = ['Robusta', 'Arabica', 'Liberica', 'Excelsa', 'Others']
const FERTILIZER_TYPE_OPTIONS = ['Organic', 'Non-Organic']
const FERTILIZER_FREQ_OPTIONS = [
  { value: 'Often', label: 'Often — 3–4 times a year' },
  { value: 'Sometimes', label: 'Sometimes — Once every year' },
  { value: 'Rarely', label: 'Rarely — Once every 2–3 years' },
  { value: 'Never', label: 'Never' },
]
const PESTICIDE_TYPE_OPTIONS = ['Organic', 'Non-Organic']
const PESTICIDE_FREQ_OPTIONS = [
  { value: 'Often', label: 'Often — Every 4–6 weeks' },
  { value: 'Sometimes', label: 'Sometimes — 1–2 times a year' },
  { value: 'Rarely', label: 'Rarely — Once every few years' },
  { value: 'Never', label: 'Never' },
]
const SHADE_TREE_OPTIONS = ['Yes', 'No']

const STAGE_FIELDS = {
  'seed-sapling': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'select', options: FERTILIZER_TYPE_OPTIONS },
    { name: 'fertilizerFrequency', label: 'Application Frequency', type: 'select-labeled', options: FERTILIZER_FREQ_OPTIONS },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'select', options: PESTICIDE_TYPE_OPTIONS },
    { name: 'pesticideFrequency', label: 'Application Frequency', type: 'select-labeled', options: PESTICIDE_FREQ_OPTIONS },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
  ],
  'tree': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'select', options: FERTILIZER_TYPE_OPTIONS },
    { name: 'fertilizerFrequency', label: 'Application Frequency', type: 'select-labeled', options: FERTILIZER_FREQ_OPTIONS },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'select', options: PESTICIDE_TYPE_OPTIONS },
    { name: 'pesticideFrequency', label: 'Application Frequency', type: 'select-labeled', options: PESTICIDE_FREQ_OPTIONS },
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Coffee Yield (kg)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: SHADE_TREE_OPTIONS },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
  ],
  'flowering': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'select', options: FERTILIZER_TYPE_OPTIONS },
    { name: 'fertilizerFrequency', label: 'Application Frequency', type: 'select-labeled', options: FERTILIZER_FREQ_OPTIONS },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'select', options: PESTICIDE_TYPE_OPTIONS },
    { name: 'pesticideFrequency', label: 'Application Frequency', type: 'select-labeled', options: PESTICIDE_FREQ_OPTIONS },
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Coffee Yield (kg)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: SHADE_TREE_OPTIONS },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
    { name: 'estimatedFloweringDate', label: 'Estimated Flowering Date', type: 'date' },
  ],
  'ready-to-harvest': [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'select', options: FERTILIZER_TYPE_OPTIONS },
    { name: 'fertilizerFrequency', label: 'Application Frequency', type: 'select-labeled', options: FERTILIZER_FREQ_OPTIONS },
    { name: 'pesticideType', label: 'Pesticide Type', type: 'select', options: PESTICIDE_TYPE_OPTIONS },
    { name: 'pesticideFrequency', label: 'Application Frequency', type: 'select-labeled', options: PESTICIDE_FREQ_OPTIONS },
    { name: 'harvestDate', label: 'Harvest Date', type: 'date' },
    { name: 'previousYield', label: 'Previous Yield (kg)', type: 'number' },
    { name: 'predictedYield', label: 'Predicted Yield (kg)', type: 'number' },
    { name: 'harvestSeason', label: 'Date & Season of Harvest', type: 'text' },
    { name: 'currentYield', label: 'Current/Actual Yield (kg)', type: 'number' },
    { name: 'gradeFine', label: 'Grade: Fine (%)', type: 'number' },
    { name: 'gradePremium', label: 'Grade: Premium (%)', type: 'number' },
    { name: 'gradeCommercial', label: 'Grade: Commercial (%)', type: 'number' },
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: SHADE_TREE_OPTIONS },
    { name: 'estimatedHarvestDate', label: 'Estimated Harvest Date', type: 'date' },
    // Pre-Harvest fields
    { name: 'preLastHarvestDate', label: 'Pre-Harvest: Last Harvest Date', type: 'date' },
    { name: 'preTotalTrees', label: 'Pre-Harvest: Total Trees', type: 'number' },
    { name: 'preYieldKg', label: 'Pre-Harvest: Yielded Coffee (kg)', type: 'number' },
    { name: 'preGradeFine', label: 'Pre-Harvest: Fine Grade (kg)', type: 'number' },
    { name: 'preGradePremium', label: 'Pre-Harvest: Premium Grade (kg)', type: 'number' },
    { name: 'preGradeCommercial', label: 'Pre-Harvest: Commercial Grade (kg)', type: 'number' },
    // Post-Harvest fields
    { name: 'postCurrentYield', label: 'Post-Harvest: Current Yield (kg)', type: 'number' },
    { name: 'postGradeFine', label: 'Post-Harvest: Fine (%)', type: 'number' },
    { name: 'postGradePremium', label: 'Post-Harvest: Premium (%)', type: 'number' },
    { name: 'postGradeCommercial', label: 'Post-Harvest: Commercial (%)', type: 'number' },
    { name: 'defectCount', label: 'Post-Harvest: Defect Count', type: 'number' },
    { name: 'beanMoisture', label: 'Post-Harvest: Bean Moisture Content (%)', type: 'number' },
    { name: 'beanScreenSize', label: 'Post-Harvest: Bean Screen Size', type: 'text' },
  ],
}

export default function ClusterDetailModal({ cluster, onClose }) {
  const { updateCluster } = useFarm()
  const fields = STAGE_FIELDS[cluster.plantStage] || STAGE_FIELDS['seed-sapling']
  const todayDate = getTodayDateValue()
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
  const [formError, setFormError] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  useEffect(() => {
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm)
    setIsDirty(hasChanges)
  }, [form, initialForm])

  const handleChange = (e) => {
    const { name, value } = e.target
    if (formError) setFormError('')
    if (name === 'lastPrunedDate' && value && value > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (form.lastPrunedDate && form.lastPrunedDate > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
    setShowSaveConfirm(true)
  }

  const doSave = async () => {
    if (form.lastPrunedDate && form.lastPrunedDate > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
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
      ) : field.type === 'select-labeled' ? (
        <select name={field.name} value={form[field.name]} onChange={handleChange}>
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          name={field.name}
          type={field.type}
          step={field.step}
          min={field.min}
          max={field.name === 'lastPrunedDate' ? todayDate : field.max}
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
          {formError && <div className="modal-form-error">{formError}</div>}
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
        isOpen={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={doSave}
        title="Save Data?"
        message={`Save the updated data for "${cluster.clusterName}"?`}
        confirmText="Save"
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
