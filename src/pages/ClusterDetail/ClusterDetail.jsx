import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, ChevronDown } from 'lucide-react'
import { useFarm } from '../../context/FarmContext'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import './ClusterDetail.css'

const STAGE_OPTIONS = [
  { value: 'seed-sapling', label: 'Sapling' },
  { value: 'tree', label: 'Tree' },
  { value: 'flowering', label: 'Flowering' },
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
const AGRICLIMATIC_FIELD_NAMES = ['monthlyTemperature', 'rainfall', 'humidity', 'soilPh']
const PRUNING_FUTURE_DATE_ERROR = 'Last Pruned Date cannot be set to a future date.'
const PERCENT_TOLERANCE = 0.01
const PERCENTAGE_TRIPLETS = [
  {
    first: 'gradeFine',
    second: 'gradePremium',
    last: 'gradeCommercial',
    label: 'Grade Breakdown',
  },
  {
    first: 'postGradeFine',
    second: 'postGradePremium',
    last: 'postGradeCommercial',
    label: 'Post-Harvest Grade Breakdown',
  },
]

const SECTION_FIELDS = {
  overview: [
    { name: 'datePlanted', label: 'Date Planted', type: 'date' },
    { name: 'numberOfPlants', label: 'Number of Plants', type: 'number' },
    { name: 'variety', label: 'Variety', type: 'select', options: VARIETY_OPTIONS },
    { name: 'lastHarvestedDate', label: 'Last Harvested Date', type: 'date' },
    { name: 'monthlyTemperature', label: 'Average Monthly Temperature (°C)', type: 'number' },
    { name: 'rainfall', label: 'Average Monthly Rainfall (mm)', type: 'number' },
    { name: 'humidity', label: 'Average Monthly Humidity (%)', type: 'number' },
    { name: 'soilPh', label: 'Soil pH (0–14)', type: 'number', step: '0.1', min: '0', max: '14' },
    { name: 'estimatedFloweringDate', label: 'Estimated Flowering Date', type: 'date' },
    { name: 'actualFloweringDate', label: 'Actual Flowering Date', type: 'date' },
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

function parsePercent(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPercent(value) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(2))
}

function applyAutoPercentages(formValues) {
  const next = { ...formValues }

  PERCENTAGE_TRIPLETS.forEach(({ first, second, last }) => {
    const keys = [first, second, last]
    const values = keys.map((key) => parsePercent(next[key]))
    const filledIndexes = values
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value !== null)

    // Auto-compute only when exactly two values are present.
    if (filledIndexes.length === 2) {
      const missingIndex = [0, 1, 2].find((index) => values[index] === null)
      const sumOfFilled = filledIndexes.reduce((sum, entry) => sum + entry.value, 0)
      const remaining = 100 - sumOfFilled
      const targetKey = keys[missingIndex]

      if (remaining >= 0 && remaining <= 100) {
        next[targetKey] = formatPercent(remaining)
      } else {
        next[targetKey] = ''
      }
    }
  })

  return next
}

function getPercentageValidationError(formValues) {
  for (const { first, second, last, label } of PERCENTAGE_TRIPLETS) {
    const firstVal = parsePercent(formValues[first])
    const secondVal = parsePercent(formValues[second])
    const lastVal = parsePercent(formValues[last])
    const hasAnyValue = firstVal !== null || secondVal !== null || lastVal !== null

    if (!hasAnyValue) continue

    if (firstVal === null || secondVal === null || lastVal === null) {
      return `${label}: complete all three percentage fields.`
    }

    if (firstVal < 0 || secondVal < 0 || lastVal < 0 || firstVal > 100 || secondVal > 100 || lastVal > 100) {
      return `${label}: each value must be between 0 and 100.`
    }

    const total = firstVal + secondVal + lastVal
    if (Math.abs(total - 100) > PERCENT_TOLERANCE) {
      return `${label}: total must be exactly 100%.`
    }
  }

  return ''
}

export default function ClusterDetail() {
  const { clusterId, section = 'overview' } = useParams()
  const navigate = useNavigate()
  const { getCluster, updateCluster } = useFarm()
  const cluster = getCluster(clusterId)
  const [form, setForm] = useState({})
  const [isDirty, setIsDirty] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [agriclimaticData, setAgriclimaticData] = useState(null)
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
  const isPruningSection = section === 'pruning'
  const isFertilizeSection = section === 'fertilize'
  const isPruningLocked = isPruningSection && cluster?.plantStage === 'seed-sapling'
  const isSectionLocked = isHarvestLocked || isPruningLocked
  const todayDate = useMemo(() => formatDateLocal(new Date()), [])

  const fields = useMemo(() => {
    const baseFields = SECTION_FIELDS[section] || []
    if (section !== 'overview') return baseFields

    const nextFields = baseFields.filter(
      (field) =>
        field.name !== 'estimatedFloweringDate' &&
        field.name !== 'actualFloweringDate' &&
        field.name !== 'lastHarvestedDate'
    )

    if (cluster?.plantStage === 'tree') {
      const treeField = baseFields.find((field) => field.name === 'lastHarvestedDate')
      if (treeField) nextFields.push(treeField)
    } else if (cluster?.plantStage === 'flowering') {
      const floweringField = baseFields.find((field) => field.name === 'estimatedFloweringDate')
      if (floweringField) nextFields.push(floweringField)
      const actualFloweringField = baseFields.find((field) => field.name === 'actualFloweringDate')
      if (actualFloweringField) nextFields.push(actualFloweringField)
    }

    return nextFields
  }, [section, cluster?.plantStage])
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
  const isOverviewSection = section === 'overview'

  useEffect(() => {
    if (!isOverviewSection) return

    let isCancelled = false
    const fetchAgriclimatic = async () => {
      const { data, error } = await supabase
        .from('admin_climate_reference')
        .select('monthly_temperature, rainfall, humidity, soil_ph, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error fetching admin_climate_reference:', error.message)
        return
      }

      if (!isCancelled && data) {
        setAgriclimaticData({
          monthlyTemperature: data.monthly_temperature ?? '',
          rainfall: data.rainfall ?? '',
          humidity: data.humidity ?? '',
          soilPh: data.soil_ph ?? '',
        })
      }
    }

    fetchAgriclimatic()
    return () => {
      isCancelled = true
    }
  }, [isOverviewSection])

  useEffect(() => {
    if (!isOverviewSection || !cluster?.id || !agriclimaticData) return

    const hasAgriclimaticMismatch = AGRICLIMATIC_FIELD_NAMES.some((fieldName) => {
      const clusterVal = cluster.stageData?.[fieldName]
      const adminVal = agriclimaticData[fieldName]

      const normalizedClusterVal =
        clusterVal === '' || clusterVal === undefined || clusterVal === null ? null : Number(clusterVal)
      const normalizedAdminVal =
        adminVal === '' || adminVal === undefined || adminVal === null ? null : Number(adminVal)

      return normalizedClusterVal !== normalizedAdminVal
    })

    if (!hasAgriclimaticMismatch) return

    ;(async () => {
      const result = await updateCluster(cluster.id, {
        stageData: {
          monthlyTemperature: agriclimaticData.monthlyTemperature,
          rainfall: agriclimaticData.rainfall,
          humidity: agriclimaticData.humidity,
          soilPh: agriclimaticData.soilPh,
        },
      })

      if (!result?.success) {
        console.error('Failed to sync agriclimatic data into cluster stage data:', result?.error)
      }
    })()
  }, [agriclimaticData, cluster?.id, cluster?.stageData, isOverviewSection, updateCluster])

  const sectionFormSnapshot = useMemo(() => {
    const nextForm = {}
    fields.forEach((field) => {
      if (field.name === 'numberOfPlants') {
        nextForm[field.name] = cluster?.plantCount ?? ''
        return
      }
      if (isOverviewSection && AGRICLIMATIC_FIELD_NAMES.includes(field.name)) {
        if (agriclimaticData && agriclimaticData[field.name] !== undefined) {
          nextForm[field.name] = agriclimaticData[field.name]
          return
        }
      }
      nextForm[field.name] = cluster?.stageData?.[field.name] ?? ''
    })
    return applyAutoPercentages(nextForm)
  }, [agriclimaticData, cluster?.plantCount, cluster?.stageData, fields, isOverviewSection])

  useEffect(() => {
    if (!SECTION_FIELDS[section]) {
      navigate(`/clusters/${clusterId}/overview`, { replace: true })
      return
    }
    setIsDirty(false)
    setFormError('')
  }, [clusterId, navigate, section])

  useEffect(() => {
    if (!isDirty) {
      setForm(sectionFormSnapshot)
    }
  }, [isDirty, sectionFormSnapshot])

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
    const { name, value } = e.target
    if (formError) setFormError('')
    if (name === 'lastPrunedDate' && value && value > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
    if (isFertilizeSection && name === 'soilPh') return
    if (isOverviewSection && AGRICLIMATIC_FIELD_NAMES.includes(e.target.name)) return
    setIsDirty(true)
    setForm((prev) => {
      const next = applyAutoPercentages({ ...prev, [name]: value })

      const triplet = PERCENTAGE_TRIPLETS.find((group) =>
        [group.first, group.second, group.last].includes(name)
      )
      if (triplet) {
        const values = [triplet.first, triplet.second, triplet.last]
          .map((key) => parsePercent(next[key]))
          .filter((num) => num !== null)

        if (values.length === 2 && values[0] + values[1] > 100 + PERCENT_TOLERANCE) {
          setFormError(`${triplet.label}: selected values cannot exceed 100%.`)
        }
      }

      return next
    })
  }

  const handleStageChange = async (e) => {
    const nextStage = e.target.value
    const resolvedVariety =
      (typeof form?.variety === 'string' && form.variety.trim()) ||
      (typeof cluster?.stageData?.variety === 'string' && cluster.stageData.variety.trim()) ||
      (typeof cluster?.variety === 'string' && cluster.variety.trim()) ||
      ''

    const updates = {
      plantStage: nextStage,
      ...(resolvedVariety
        ? {
            stageData: {
              ...(cluster.stageData || {}),
              variety: resolvedVariety,
            },
          }
        : {}),
    }

    // When cluster enters flowering stage, auto-compute estimated harvest date (+11 months).
    if (nextStage === 'flowering') {
      const now = new Date()
      const estimate = new Date(now.getFullYear(), now.getMonth() + 11, now.getDate())
      updates.stageData = {
        ...(cluster.stageData || {}),
        ...(resolvedVariety ? { variety: resolvedVariety } : {}),
        estimatedHarvestDate: formatDateLocal(estimate),
      }
    }

    const result = await updateCluster(cluster.id, updates)
    if (!result?.success) {
      setFormError(result?.error || 'Unable to update plant stage.')
    }
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (isSectionLocked) return
    if (form.lastPrunedDate && form.lastPrunedDate > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
    const percentageError = getPercentageValidationError(form)
    if (percentageError) {
      setFormError(percentageError)
      return
    }
    setShowSaveConfirm(true)
  }

  const doSave = async () => {
    if (isSectionLocked) return
    if (form.lastPrunedDate && form.lastPrunedDate > todayDate) {
      setFormError(PRUNING_FUTURE_DATE_ERROR)
      return
    }
    const percentageError = getPercentageValidationError(form)
    if (percentageError) {
      setFormError(percentageError)
      return
    }
    setSaving(true)
    try {
      const { numberOfPlants, ...stageDataPayload } = form
      const result = await updateCluster(cluster.id, {
        stageData: {
          ...(cluster.stageData || {}),
          ...stageDataPayload,
        },
      })
      if (!result?.success) {
        setFormError(result?.error || 'Unable to save cluster details.')
        return
      }
      setShowSaveConfirm(false)
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field) => (
    <div className="form-group" key={field.name}>
      <label>{field.label}</label>
      {field.type === 'select' ? (
        <select
          name={field.name}
          value={form[field.name] ?? ''}
          onChange={handleFieldChange}
          disabled={isOverviewSection && AGRICLIMATIC_FIELD_NAMES.includes(field.name)}
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
          disabled={isOverviewSection && AGRICLIMATIC_FIELD_NAMES.includes(field.name)}
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
          max={field.name === 'lastPrunedDate' ? todayDate : field.max}
          value={form[field.name] ?? ''}
          onChange={handleFieldChange}
          disabled={
            field.name === 'numberOfPlants' ||
            (isFertilizeSection && field.name === 'soilPh') ||
            (isOverviewSection && AGRICLIMATIC_FIELD_NAMES.includes(field.name))
          }
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
          <p>Area: {cluster.areaSize} sqm | Plants: {cluster.plantCount}</p>
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
        {isSectionLocked && (
          <div className="cd-lock-panel">
            <p className="cd-lock-note">
              {isHarvestLocked
                ? 'Harvest inputs are available only when the cluster stage is Ready to Harvest.'
                : 'Pruning inputs are not available while the cluster stage is Sapling.'}
            </p>
            <p className="cd-lock-note-sub">
              {isHarvestLocked
                ? 'Use the Plant Stage selector above to change this cluster to Ready to Harvest.'
                : 'Use the Plant Stage selector above to move this cluster to Tree or later before logging pruning data.'}
            </p>
          </div>
        )}
        {!isSectionLocked && (
          <form className="cd-form" onSubmit={handleSave}>
            {formError && <div className="cd-form-error">{formError}</div>}
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
