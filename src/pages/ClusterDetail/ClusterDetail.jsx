import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, ChevronDown } from 'lucide-react'
import { useFarm } from '../../context/FarmContext'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import './ClusterDetail.css'

const STAGE_OPTIONS = [
  { value: 'seed-sapling', label: 'Seed / Sapling' },
  { value: 'tree', label: 'Tree' },
  { value: 'flowering', label: 'Flowering / Fruit-bearing' },
  { value: 'ready-to-harvest', label: 'Ready to Harvest' },
]

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

const SECTION_FIELDS = {
  overview: [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
  ],
  harvest: [
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'harvestDate', label: 'Harvest Date', type: 'date' },
    { name: 'estimatedHarvestDate', label: 'Estimated Harvest Date', type: 'date' },
    { name: 'harvestSeason', label: 'Date & Season of Harvest', type: 'text' },
    { name: 'previousYield', label: 'Previous Yield (kg)', type: 'number' },
    { name: 'predictedYield', label: 'Predicted Yield (kg)', type: 'number' },
    { name: 'currentYield', label: 'Current/Actual Yield (kg)', type: 'number' },
    { name: 'gradeFine', label: 'Grade: Fine (%)', type: 'number' },
    { name: 'gradePremium', label: 'Grade: Premium (%)', type: 'number' },
    { name: 'gradeCommercial', label: 'Grade: Commercial (%)', type: 'number' },
    { name: 'preLastHarvestDate', label: 'Pre-Harvest: Last Harvest Date', type: 'date' },
    { name: 'preTotalTrees', label: 'Pre-Harvest: Total Trees', type: 'number' },
    { name: 'preYieldKg', label: 'Pre-Harvest: Yielded Coffee (kg)', type: 'number' },
    { name: 'preGradeFine', label: 'Pre-Harvest: Fine Grade (kg)', type: 'number' },
    { name: 'preGradePremium', label: 'Pre-Harvest: Premium Grade (kg)', type: 'number' },
    { name: 'preGradeCommercial', label: 'Pre-Harvest: Commercial Grade (kg)', type: 'number' },
    { name: 'postCurrentYield', label: 'Post-Harvest: Current Yield (kg)', type: 'number' },
    { name: 'postGradeFine', label: 'Post-Harvest: Fine (%)', type: 'number' },
    { name: 'postGradePremium', label: 'Post-Harvest: Premium (%)', type: 'number' },
    { name: 'postGradeCommercial', label: 'Post-Harvest: Commercial (%)', type: 'number' },
    { name: 'defectCount', label: 'Post-Harvest: Defect Count', type: 'number' },
    { name: 'beanMoisture', label: 'Post-Harvest: Bean Moisture Content (%)', type: 'number' },
    { name: 'beanScreenSize', label: 'Post-Harvest: Bean Screen Size', type: 'text' },
  ],
  pruning: [
    { name: 'lastPrunedDate', label: 'Last Pruned Date', type: 'date' },
    { name: 'shadeTrees', label: 'Presence of Shade Trees', type: 'select', options: SHADE_TREE_OPTIONS },
  ],
  fertilize: [
    { name: 'fertilizerType', label: 'Fertilizer Type', type: 'select', options: FERTILIZER_TYPE_OPTIONS },
    { name: 'fertilizerFrequency', label: 'Application Frequency', type: 'select-labeled', options: FERTILIZER_FREQ_OPTIONS },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
  ],
  pesticide: [
    { name: 'pesticideType', label: 'Pesticide Type', type: 'select', options: PESTICIDE_TYPE_OPTIONS },
    { name: 'pesticideFrequency', label: 'Application Frequency', type: 'select-labeled', options: PESTICIDE_FREQ_OPTIONS },
  ],
}

const SECTION_TITLES = {
  overview: 'Overview',
  harvest: 'Harvest',
  pruning: 'Pruning',
  fertilize: 'Fertilize',
  pesticide: 'Pesticide',
}

const HARVEST_FIELD_GROUPS = [
  {
    id: 'timing',
    title: 'Timing and Season',
    subtitle: 'Track key dates and harvest cycle information.',
    fieldNames: ['lastHarvestedDate', 'harvestDate', 'estimatedHarvestDate', 'harvestSeason'],
  },
  {
    id: 'yield',
    title: 'Yield Overview',
    subtitle: 'Capture previous, predicted, and actual production.',
    fieldNames: ['previousYield', 'predictedYield', 'currentYield'],
  },
  {
    id: 'grade',
    title: 'Grade Breakdown',
    subtitle: 'Record quality percentage by grade class.',
    fieldNames: ['gradeFine', 'gradePremium', 'gradeCommercial'],
  },
  {
    id: 'pre',
    title: 'Pre-Harvest Metrics',
    subtitle: 'Baseline production and grade output before harvest.',
    fieldNames: ['preLastHarvestDate', 'preTotalTrees', 'preYieldKg', 'preGradeFine', 'preGradePremium', 'preGradeCommercial'],
  },
  {
    id: 'post',
    title: 'Post-Harvest Quality',
    subtitle: 'Capture current output and bean quality checks.',
    fieldNames: ['postCurrentYield', 'postGradeFine', 'postGradePremium', 'postGradeCommercial', 'defectCount', 'beanMoisture', 'beanScreenSize'],
  },
]

function formatDateLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ClusterDetail() {
  const { clusterId, section = 'overview' } = useParams()
  const navigate = useNavigate()
  const { getCluster, updateCluster } = useFarm()
  const cluster = getCluster(clusterId)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [expandedHarvestGroups, setExpandedHarvestGroups] = useState({
    timing: true,
    yield: true,
    grade: false,
    pre: false,
    post: false,
  })
  const isHarvestSection = section === 'harvest'
  const isReadyToHarvest = cluster?.plantStage === 'ready-to-harvest'
  const isHarvestLocked = isHarvestSection && !isReadyToHarvest

  const fields = useMemo(() => SECTION_FIELDS[section] || [], [section])
  const harvestFieldsByName = useMemo(
    () => Object.fromEntries(SECTION_FIELDS.harvest.map((field) => [field.name, field])),
    []
  )
  const harvestGroups = useMemo(
    () =>
      HARVEST_FIELD_GROUPS.map((group) => ({
        ...group,
        fields: group.fieldNames.map((name) => harvestFieldsByName[name]).filter(Boolean),
      })),
    [harvestFieldsByName]
  )
  const harvestProgress = useMemo(() => {
    const total = SECTION_FIELDS.harvest.length
    const completed = SECTION_FIELDS.harvest.filter((field) => {
      const value = form[field.name]
      return value !== '' && value !== null && value !== undefined
    }).length
    return {
      total,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }, [form])

  useEffect(() => {
    if (!SECTION_FIELDS[section]) {
      navigate(`/clusters/${clusterId}/overview`, { replace: true })
      return
    }
    const nextForm = {}
    fields.forEach((field) => {
      nextForm[field.name] = cluster?.stageData?.[field.name] ?? ''
    })
    setForm(nextForm)
  }, [cluster, clusterId, fields, navigate, section])

  if (!cluster) {
    return (
      <div className="cluster-detail-page">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back to Dashboard
        </button>
        <div className="empty-state">
          <h3>Cluster not found</h3>
        </div>
      </div>
    )
  }

  const handleFieldChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleStageChange = async (e) => {
    const nextStage = e.target.value
    const updates = { plantStage: nextStage }

    // When cluster enters flowering stage, auto-compute estimated harvest date (+11 months).
    if (nextStage === 'flowering') {
      const now = new Date()
      const estimate = new Date(now.getFullYear(), now.getMonth() + 11, now.getDate())
      updates.stageData = {
        ...(cluster.stageData || {}),
        estimatedHarvestDate: formatDateLocal(estimate),
      }
    }

    await updateCluster(cluster.id, updates)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (isHarvestLocked) return
    setShowSaveConfirm(true)
  }

  const doSave = async () => {
    if (isHarvestLocked) return
    setSaving(true)
    await updateCluster(cluster.id, {
      stageData: {
        ...(cluster.stageData || {}),
        ...form,
      },
    })
    setSaving(false)
  }

  const renderField = (field) => (
    <div className="form-group" key={field.name}>
      <label>{field.label}</label>
      {field.type === 'select' ? (
        <select
          name={field.name}
          value={form[field.name] ?? ''}
          onChange={handleFieldChange}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'select-labeled' ? (
        <select
          name={field.name}
          value={form[field.name] ?? ''}
          onChange={handleFieldChange}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={field.name}
          type={field.type}
          step={field.step}
          min={field.min}
          max={field.max}
          value={form[field.name] ?? ''}
          onChange={handleFieldChange}
          placeholder={field.label}
        />
      )}
    </div>
  )

  return (
    <div className="cluster-detail-page">
      <div className="cd-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="cd-title">
          <h1>{cluster.clusterName}</h1>
          <p>Area: {cluster.areaSize} ha | Plants: {cluster.plantCount}</p>
        </div>
        <div className="cd-stage">
          <label>Plant Stage</label>
          <select value={cluster.plantStage} onChange={handleStageChange}>
            {STAGE_OPTIONS.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cd-card">
        <h2>{SECTION_TITLES[section]}</h2>
        {isHarvestLocked && (
          <div className="cd-lock-panel">
            <p className="cd-lock-note">
              Harvest inputs are available only when the cluster stage is Ready to Harvest.
            </p>
            <p className="cd-lock-note-sub">
              Use the Plant Stage selector above to change this cluster to Ready to Harvest.
            </p>
          </div>
        )}
        {!isHarvestLocked && (
          <form className="cd-form" onSubmit={handleSave}>
            {isHarvestSection ? (
              <>
                <div className="harvest-form-toolbar">
                  <div className="harvest-progress-pill">
                    <span className="harvest-progress-label">Form Progress</span>
                    <span className="harvest-progress-value">
                      {harvestProgress.completed}/{harvestProgress.total} ({harvestProgress.percent}%)
                    </span>
                  </div>
                  <div className="harvest-toolbar-actions">
                    <button
                      type="button"
                      className="harvest-toolbar-btn"
                      onClick={() =>
                        setExpandedHarvestGroups({
                          timing: true,
                          yield: true,
                          grade: true,
                          pre: true,
                          post: true,
                        })
                      }
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      className="harvest-toolbar-btn"
                      onClick={() =>
                        setExpandedHarvestGroups({
                          timing: true,
                          yield: false,
                          grade: false,
                          pre: false,
                          post: false,
                        })
                      }
                    >
                      Focus Essentials
                    </button>
                  </div>
                </div>

                <div className="harvest-groups">
                  {harvestGroups.map((group) => {
                    const completedInGroup = group.fields.filter((field) => {
                      const value = form[field.name]
                      return value !== '' && value !== null && value !== undefined
                    }).length
                    const isOpen = expandedHarvestGroups[group.id]

                    return (
                      <div key={group.id} className={`harvest-group ${isOpen ? 'harvest-group--open' : ''}`}>
                        <button
                          type="button"
                          className="harvest-group-header"
                          onClick={() =>
                            setExpandedHarvestGroups((prev) => ({
                              ...prev,
                              [group.id]: !prev[group.id],
                            }))
                          }
                        >
                          <div className="harvest-group-title-wrap">
                            <h3>{group.title}</h3>
                            <p>{group.subtitle}</p>
                          </div>
                          <div className="harvest-group-meta">
                            <span className="harvest-group-count">
                              {completedInGroup}/{group.fields.length}
                            </span>
                            <ChevronDown
                              size={16}
                              className={`harvest-group-chevron ${isOpen ? 'harvest-group-chevron--open' : ''}`}
                            />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="cd-form-grid cd-form-grid--harvest">
                            {group.fields.map(renderField)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="cd-form-grid">
                {fields.map(renderField)}
              </div>
            )}
            <div className="cd-actions">
              <button type="submit" className="cd-save-btn" disabled={saving}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        isOpen={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={doSave}
        title="Save Changes?"
        message={`Save the updated data for "${cluster.clusterName}"?`}
        confirmText="Save"
        cancelText="Go Back"
        variant="success"
      />
    </div>
  )
}
