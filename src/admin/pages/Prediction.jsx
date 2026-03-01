import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getCached, setCached } from '../../lib/queryCache'
import { fetchAdminData } from '../../api/analytics'
import { getBatchPredictions, getModelMetadata } from '../../api/predict'
import SystemFlowGuide from '../../components/SystemFlowGuide/SystemFlowGuide'
import {
  Download,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const PREDICTION_CACHE_KEY = 'admin_prediction:overview'
const PREDICTION_CACHE_TTL_MS = 2 * 60 * 1000
const DATA_MODE = (import.meta.env.VITE_DATA_MODE || 'supabase').toLowerCase()
const USE_SYNTHETIC_DATA = DATA_MODE === 'synthetic'
const FETCH_TIMEOUT_MS = 15000

function withTimeout(promise, ms, label) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

function toNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function yearsSince(dateValue) {
  if (!dateValue) return 0
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs <= 0) return 0
  return diffMs / (1000 * 60 * 60 * 24 * 365.2425)
}

function monthsSince(dateValue) {
  if (!dateValue) return 0
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs <= 0) return 0
  return diffMs / (1000 * 60 * 60 * 24 * 30.4375)
}

function normalizeFloodRisk(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (['none', 'low', 'medium', 'high', 'severe'].includes(text)) return text
  return ''
}

function normalizeBeanScreenSize(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (['extra-small', 'small', 'medium', 'large', 'extra-large'].includes(text)) return text
  return ''
}

function buildFarmDerivedStats(clusters) {
  const byFarm = new Map()
  clusters.forEach((cluster) => {
    const farmId = String(cluster?.farm_id || cluster?.farms?.id || '')
    if (!farmId) return
    const plants = toNumber(cluster?.stageData?.number_of_plants ?? cluster?.stageData?.numberOfPlants ?? cluster?.plant_count ?? cluster?.plantCount)
    const entry = byFarm.get(farmId) || { clusterCount: 0, totalPlants: 0 }
    entry.clusterCount += 1
    entry.totalPlants += plants
    byFarm.set(farmId, entry)
  })
  return byFarm
}

function getLatestStageData(clusterStageData) {
  if (Array.isArray(clusterStageData)) {
    if (!clusterStageData.length) return {}
    return [...clusterStageData].sort(
      (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    )[0] || {}
  }
  return clusterStageData || {}
}

function formatMetric(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return 'N/A'
  return Number(value).toFixed(digits)
}

function mapClusterToModelFeatures(cluster, farmStatsById) {
  const sd = cluster?.stageData || {}
  const farmId = String(cluster?.farm_id || cluster?.farms?.id || '')
  const clusterId = String(cluster?.id || '')
  const farmStats = farmStatsById.get(farmId) || {}
  const numberOfPlants = toNumber(sd.number_of_plants ?? sd.numberOfPlants ?? cluster?.plant_count ?? cluster?.plantCount)
  const farmTotalPlants = toNumber(cluster?.farms?.overall_tree_count ?? farmStats.totalPlants)
  const clusterAreaSqm = toNumber(cluster?.area_size_sqm ?? cluster?.areaSize)

  return {
    farm_id: farmId,
    cluster_id: clusterId,
    farm_size_ha: toNumber(cluster?.farms?.farm_area),
    elevation_m: toNumber(cluster?.farms?.elevation_m),
    farm_cluster_count: toNumber(farmStats.clusterCount),
    cluster_plant_share_pct:
      farmTotalPlants > 0 ? (numberOfPlants / farmTotalPlants) * 100 : 0,
    cluster_tree_density_per_sqm:
      clusterAreaSqm > 0 ? numberOfPlants / clusterAreaSqm : 0,
    plant_age_years: toNumber(sd.plant_age_years ?? sd.plantAgeYears, yearsSince(sd.date_planted ?? sd.datePlanted)),
    number_of_plants: numberOfPlants,
    fertilizer_type: sd.fertilizer_type ?? sd.fertilizerType ?? '',
    fertilizer_frequency: sd.fertilizer_frequency ?? sd.fertilizerFrequency ?? '',
    pesticide_type: sd.pesticide_type ?? sd.pesticideType ?? '',
    pesticide_frequency: sd.pesticide_frequency ?? sd.pesticideFrequency ?? '',
    pruning_interval_months: toNumber(sd.pruning_interval_months ?? sd.pruningIntervalMonths, monthsSince(sd.last_pruned_date ?? sd.lastPrunedDate)),
    shade_tree_present: sd.shade_tree_present ?? sd.shadeTrees ?? '',
    soil_ph: toNumber(sd.soil_ph ?? sd.soilPh),
    avg_temp_c: toNumber(sd.avg_temp_c ?? sd.monthly_temperature ?? sd.monthlyTemperature),
    avg_rainfall_mm: toNumber(sd.avg_rainfall_mm ?? sd.rainfall),
    avg_humidity_pct: toNumber(sd.avg_humidity_pct ?? sd.humidity),
    flood_risk_level: normalizeFloodRisk(sd.flood_risk_level ?? sd.floodRiskLevel),
    flood_events_count: toNumber(sd.flood_events_count ?? sd.floodEventsCount),
    pre_total_trees: toNumber(sd.pre_total_trees ?? sd.preTotalTrees ?? numberOfPlants),
    pre_yield_kg: toNumber(sd.pre_yield_kg ?? sd.preYieldKg ?? sd.previous_yield ?? sd.previousYield),
    pre_grade_fine: toNumber(sd.pre_grade_fine ?? sd.preGradeFine),
    pre_grade_premium: toNumber(sd.pre_grade_premium ?? sd.preGradePremium),
    pre_grade_commercial: toNumber(sd.pre_grade_commercial ?? sd.preGradeCommercial),
    previous_fine_pct: toNumber(sd.previous_fine_pct ?? sd.grade_fine ?? sd.gradeFine),
    previous_premium_pct: toNumber(sd.previous_premium_pct ?? sd.grade_premium ?? sd.gradePremium),
    previous_commercial_pct: toNumber(sd.previous_commercial_pct ?? sd.grade_commercial ?? sd.gradeCommercial),
    bean_size_mm: toNumber(sd.bean_size_mm ?? sd.beanSizeMm),
    bean_screen_size: normalizeBeanScreenSize(sd.bean_screen_size ?? sd.beanScreenSize),
    bean_moisture: toNumber(sd.bean_moisture ?? sd.beanMoisture),
    defect_black_pct: toNumber(sd.defect_black_pct ?? sd.defectBlackPct),
    defect_mold_infested_pct: toNumber(sd.defect_mold_infested_pct ?? sd.defectMoldInfestedPct),
    defect_immature_pct: toNumber(sd.defect_immature_pct ?? sd.defectImmaturePct),
    defect_broken_pct: toNumber(sd.defect_broken_pct ?? sd.defectBrokenPct),
    defect_dried_cherries_pct: toNumber(sd.defect_dried_cherries_pct ?? sd.defectDriedCherriesPct),
    defect_foreign_matter_pct: toNumber(sd.defect_foreign_matter_pct ?? sd.defectForeignMatterPct),
    pns_total_defects_pct: toNumber(sd.pns_total_defects_pct ?? sd.pnsTotalDefectsPct),
  }
}

function getPredictedYield(cluster, predictionByClusterId) {
  const modelPred = predictionByClusterId.get(String(cluster.id))
  if (modelPred && Number.isFinite(Number(modelPred.yield_kg))) {
    return Number(modelPred.yield_kg)
  }
  return toNumber(cluster?.stageData?.predicted_yield ?? cluster?.stageData?.predictedYield)
}

function getPredictedGradeLabel(cluster, predictionByClusterId) {
  const modelPred = predictionByClusterId.get(String(cluster.id))
  if (!modelPred) return 'N/A'
  const label = String(modelPred.grade_label || '').trim()
  const dominant = String(modelPred.dominant_grade || '').trim()
  if (!label && !dominant) return 'N/A'
  if (label && dominant) return `${label} (${dominant})`
  return label || dominant
}

export default function Prediction() {
  const [searchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState('overall') // 'overall' or 'farm'
  const [overallData, setOverallData] = useState([])
  const [farmData, setFarmData] = useState([])
  const [expandedFarm, setExpandedFarm] = useState(null)
  const [predictionSource, setPredictionSource] = useState('database')
  const [modelMetadata, setModelMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    fetchPredictionData()
    fetchModelMetadata()
  }, [])

  useEffect(() => {
    const requestedView = searchParams.get('view')
    if (requestedView === 'farm' || requestedView === 'overall') {
      setViewMode(requestedView)
    }
  }, [searchParams])

  const fetchPredictionData = async () => {
    setPageError('')
    const cached = getCached(PREDICTION_CACHE_KEY, PREDICTION_CACHE_TTL_MS)
    if (cached) {
      setOverallData(cached.overallData)
      setFarmData(cached.farmData)
      setPredictionSource(cached.predictionSource || 'database')
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      let clusters = []
      let harvests = []

      if (USE_SYNTHETIC_DATA) {
        const synthetic = await withTimeout(
          fetchAdminData(),
          FETCH_TIMEOUT_MS,
          'Synthetic admin dataset fetch'
        )
        clusters = (synthetic?.data?.clusters || []).map((c) => ({
          ...c,
          stageData: getLatestStageData(c.cluster_stage_data),
        }))
        harvests = synthetic?.data?.harvest_records || []
      } else {
        const [clustersRes, harvestsRes] = await withTimeout(Promise.all([
          supabase
            .from('clusters')
            .select('*, cluster_stage_data(*), farms!inner(id, farm_name, user_id, farm_area, elevation_m, overall_tree_count, users!inner(first_name, last_name))'),
          supabase
            .from('harvest_records')
            .select('*, clusters!inner(farm_id, farms!inner(farm_name))'),
        ]), FETCH_TIMEOUT_MS, 'Supabase prediction query')

        if (clustersRes.error || harvestsRes.error) {
          throw clustersRes.error || harvestsRes.error
        }

        clusters = (clustersRes.data || []).map((c) => ({
          ...c,
          stageData: getLatestStageData(c.cluster_stage_data),
        }))
        harvests = harvestsRes.data || []
      }

      const farmStatsById = buildFarmDerivedStats(clusters)
      const clusterActualYieldMap = new Map()

      harvests.forEach((record) => {
        const clusterId = record.cluster_id
        if (!clusterId) return
        const nextTotal = (clusterActualYieldMap.get(clusterId) || 0) + toNumber(record.yield_kg)
        clusterActualYieldMap.set(clusterId, nextTotal)
      })

      const predictionByClusterId = new Map()
      try {
        const samples = clusters.map((cluster) => ({
          id: String(cluster.id),
          features: mapClusterToModelFeatures(cluster, farmStatsById),
        }))
        if (samples.length > 0) {
          const batchResult = await withTimeout(
            getBatchPredictions(samples),
            FETCH_TIMEOUT_MS,
            'Batch prediction'
          )
          ;(batchResult?.predictions || []).forEach((item) => {
            if (item?.id === undefined || !item?.prediction) return
            predictionByClusterId.set(String(item.id), item.prediction)
          })
        }
      } catch (predictionError) {
        console.warn('Model API unavailable, falling back to stored predicted values:', predictionError)
      }

      const source = predictionByClusterId.size > 0 ? 'model' : (USE_SYNTHETIC_DATA ? 'synthetic' : 'database')
      setPredictionSource(source)

      // --- Overall aggregated data ---
      const seasonMap = {}
      harvests.forEach((h) => {
        const season = h.season || 'Unknown'
        if (!seasonMap[season]) seasonMap[season] = { season, actual: 0, predicted: 0 }
        seasonMap[season].actual += toNumber(h.yield_kg)
      })

      clusters.forEach((cluster) => {
        const sd = cluster.stageData
        const season = sd?.season || sd?.harvest_season
        if (!season) return

        if (!seasonMap[season]) {
          seasonMap[season] = { season, actual: 0, predicted: 0 }
        }
        seasonMap[season].predicted += getPredictedYield(cluster, predictionByClusterId)
      })

      const overall = Object.values(seasonMap).map((seasonRow) => ({
        ...seasonRow,
        actual: Math.round(seasonRow.actual),
        predicted: Math.round(seasonRow.predicted),
      }))

      const nextOverallData = overall.length > 0
        ? overall
        : [
            { season: '2023 Dry', actual: 0, predicted: 0 },
            { season: '2023 Wet', actual: 0, predicted: 0 },
            { season: '2024 Dry', actual: 0, predicted: 0 },
            { season: '2024 Wet', actual: 0, predicted: 0 },
            { season: '2025 Dry', actual: 0, predicted: 0 },
          ]
      setOverallData(nextOverallData)

      // --- Per-farm data ---
      const farmMap = {}
      clusters.forEach((cluster) => {
        const farm = cluster.farms
        const farmId = farm?.id
        if (!farmId) return

        if (!farmMap[farmId]) {
          farmMap[farmId] = {
            id: farmId,
            farmName: farm.farm_name,
            farmerName: `${farm.users?.first_name || ''} ${farm.users?.last_name || ''}`.trim(),
            clusters: [],
            totalPredicted: 0,
            totalActual: 0,
            totalPrevious: 0,
          }
        }

        const sd = cluster.stageData
        const predicted = getPredictedYield(cluster, predictionByClusterId)
        const actual = clusterActualYieldMap.get(cluster.id) || toNumber(sd?.current_yield ?? sd?.currentYield)
        const previous = toNumber(sd?.pre_yield_kg ?? sd?.previous_yield ?? sd?.previousYield)

        farmMap[farmId].clusters.push({
          name: cluster.cluster_name,
          predicted: Math.round(predicted),
          actual: Math.round(actual),
          previous: Math.round(previous),
          stage: cluster.plant_stage,
          predictedGrade: getPredictedGradeLabel(cluster, predictionByClusterId),
        })
        farmMap[farmId].totalPredicted += predicted
        farmMap[farmId].totalActual += actual
        farmMap[farmId].totalPrevious += previous
      })

      const nextFarmData = Object.values(farmMap).map((farmRow) => ({
        ...farmRow,
        totalPredicted: Math.round(farmRow.totalPredicted),
        totalActual: Math.round(farmRow.totalActual),
        totalPrevious: Math.round(farmRow.totalPrevious),
      }))
      setFarmData(nextFarmData)

      setCached(PREDICTION_CACHE_KEY, {
        overallData: nextOverallData,
        farmData: nextFarmData,
        predictionSource: source,
      })
    } catch (err) {
      console.error('Error fetching prediction data:', err)
      setPageError(err?.message || 'Unable to load prediction data.')
    }
    setLoading(false)
  }

  const fetchModelMetadata = async () => {
    try {
      const metadataResult = await getModelMetadata()
      if (metadataResult?.available && metadataResult?.metadata) {
        setModelMetadata(metadataResult.metadata)
      }
    } catch (metadataError) {
      console.warn('Unable to load model metadata:', metadataError)
    }
  }

  const farmQuery = (searchParams.get('q') || '').trim().toLowerCase()
  const filteredFarmData = useMemo(() => {
    if (!farmQuery) return farmData
    return farmData.filter((farm) =>
      (farm.farmName || '').toLowerCase().includes(farmQuery) ||
      (farm.farmerName || '').toLowerCase().includes(farmQuery)
    )
  }, [farmData, farmQuery])

  useEffect(() => {
    const targetFarmName = (searchParams.get('q') || '').trim().toLowerCase()
    const targetFarmId = (searchParams.get('farm') || '').trim()

    if (!targetFarmName && !targetFarmId) return

    const match = farmData.find((farm) => {
      if (targetFarmId && String(farm.id) === targetFarmId) return true
      if (targetFarmName) return (farm.farmName || '').toLowerCase() === targetFarmName
      return false
    })

    if (match) {
      setViewMode('farm')
      setExpandedFarm(match.id)
    }
  }, [farmData, searchParams])

  const handleExportCSV = () => {
    let csv = ''
    if (viewMode === 'overall') {
      csv = 'Season,Predicted Yield (kg),Actual Yield (kg)\n'
      overallData.forEach((row) => {
        csv += `${row.season},${row.predicted},${row.actual}\n`
      })
    } else {
      csv = 'Farm,Farmer,Predicted (kg),Actual (kg),Previous (kg)\n'
      farmData.forEach((farm) => {
        csv += `${farm.farmName},${farm.farmerName},${farm.totalPredicted},${farm.totalActual},${farm.totalPrevious}\n`
      })
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prediction_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const yieldMetrics = modelMetadata?.targets?.yield_kg?.test_metrics
  const yieldModelName = modelMetadata?.targets?.yield_kg?.selected_candidate
  const trainedAtUtc = modelMetadata?.trained_at_utc || ''

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-spinner"></div>
        <p>Loading prediction data...</p>
      </div>
    )
  }

  return (
    <div className="prediction-page">
      <div className="prediction-header">
        <div>
          <h1>Yield Prediction</h1>
          <p>
            Overall yield analysis and per-farm comparison
            {' '}
            ({predictionSource === 'model' ? 'Model-driven' : predictionSource === 'synthetic' ? 'Synthetic data' : 'Stored values'})
          </p>
          {yieldMetrics && (
            <p>
              Yield model: {yieldModelName || 'N/A'}
              {' '}
              | R2 {formatMetric(yieldMetrics.r2)}
              {' '}
              | RMSE {formatMetric(yieldMetrics.rmse)}
              {' '}
              | MAE {formatMetric(yieldMetrics.mae)}
              {trainedAtUtc ? ` | Trained ${trainedAtUtc}` : ''}
            </p>
          )}
        </div>
        <div className="prediction-controls">
          <button
            className={`prediction-toggle ${viewMode === 'overall' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'overall' ? 'farm' : 'overall')}
          >
            {viewMode === 'overall' ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
            {viewMode === 'overall' ? 'Overall View' : 'Per-Farm View'}
          </button>
          <button className="prediction-export-btn" onClick={handleExportCSV}>
            <Download size={16} />
            {' '}
            Export CSV
          </button>
        </div>
      </div>

      {pageError && (
        <div className="cd-form-error" style={{ marginBottom: 12 }}>
          Prediction page data load issue: {pageError}
        </div>
      )}

      <SystemFlowGuide mode="prediction" />

      {viewMode === 'overall' ? (
        <div className="prediction-overall">
          <div className="prediction-chart-card">
            <h3>
              <TrendingUp size={18} />
              {' '}
              Multi-Year Yield Comparison
            </h3>
            <p>Predicted vs Actual yield across seasons</p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={overallData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="season" fontSize={12} tick={{ fill: '#64748b' }} />
                <YAxis fontSize={12} tick={{ fill: '#64748b' }} unit=" kg" />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(val) => [`${val.toLocaleString()} kg`]}
                />
                <Legend />
                <Bar dataKey="predicted" fill="#f59e0b" name="Predicted Yield" radius={[6, 6, 0, 0]} />
                <Bar dataKey="actual" fill="#3b82f6" name="Actual Yield" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="prediction-summary-grid">
            {overallData.map((season) => {
              const diff = season.actual - season.predicted
              const pct = season.predicted > 0 ? ((diff / season.predicted) * 100).toFixed(1) : 0
              return (
                <div key={season.season} className="prediction-summary-card">
                  <h4>{season.season}</h4>
                  <div className="prediction-summary-row">
                    <span>Predicted:</span>
                    <strong>{season.predicted.toLocaleString()} kg</strong>
                  </div>
                  <div className="prediction-summary-row">
                    <span>Actual:</span>
                    <strong>{season.actual.toLocaleString()} kg</strong>
                  </div>
                  <div className={`prediction-diff ${diff >= 0 ? 'positive' : 'negative'}`}>
                    {diff >= 0 ? '+' : ''}
                    {pct}
                    %
                    {' '}
                    {diff >= 0 ? 'Over' : 'Under'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="prediction-farm-view">
          {filteredFarmData.length > 0 ? filteredFarmData.map((farm) => (
            <div key={farm.id} className="prediction-farm-card">
              <div
                className="prediction-farm-header"
                onClick={() => setExpandedFarm(expandedFarm === farm.id ? null : farm.id)}
              >
                <div className="prediction-farm-info">
                  {expandedFarm === farm.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <div>
                    <h4>{farm.farmName}</h4>
                    <span className="prediction-farmer-name">{farm.farmerName}</span>
                  </div>
                </div>
                <div className="prediction-farm-stats">
                  <div className="prediction-stat">
                    <span>Predicted</span>
                    <strong>{farm.totalPredicted.toLocaleString()} kg</strong>
                  </div>
                  <div className="prediction-stat">
                    <span>Actual</span>
                    <strong>{farm.totalActual.toLocaleString()} kg</strong>
                  </div>
                  <div className="prediction-stat">
                    <span>Previous</span>
                    <strong>{farm.totalPrevious.toLocaleString()} kg</strong>
                  </div>
                </div>
              </div>

              {expandedFarm === farm.id && (
                <div className="prediction-farm-expanded">
                  <div className="prediction-cluster-chart-card">
                    <h5>Cluster Yield Breakdown</h5>
                    <p>Predicted, actual, and previous yield per cluster</p>
                    <div className="prediction-cluster-chart-wrap">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={farm.clusters} barGap={6}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" fontSize={11} tick={{ fill: '#64748b' }} />
                          <YAxis fontSize={11} tick={{ fill: '#64748b' }} unit=" kg" />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                            formatter={(val) => [`${Number(val).toLocaleString()} kg`]}
                          />
                          <Legend />
                          <Bar dataKey="predicted" fill="#f59e0b" name="Predicted" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="previous" fill="#22c55e" name="Previous" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <table className="prediction-cluster-table">
                    <thead>
                      <tr>
                        <th>Cluster</th>
                        <th>Stage</th>
                        <th>Predicted Grade</th>
                        <th>Predicted (kg)</th>
                        <th>Actual (kg)</th>
                        <th>Previous (kg)</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {farm.clusters.map((cluster, index) => {
                        const diff = cluster.actual - cluster.predicted
                        const stageClass = String(cluster.stage || '')
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                        return (
                          <tr key={index}>
                            <td className="cluster-name-bold">{cluster.name}</td>
                            <td>
                              <span className={`stage-tag stage-${stageClass}`}>{cluster.stage}</span>
                            </td>
                            <td>{cluster.predictedGrade}</td>
                            <td>{cluster.predicted.toLocaleString()}</td>
                            <td>{cluster.actual.toLocaleString()}</td>
                            <td>{cluster.previous.toLocaleString()}</td>
                            <td className={diff >= 0 ? 'text-green' : 'text-red'}>
                              {diff >= 0 ? '+' : ''}
                              {diff.toLocaleString()}
                              {' '}
                              kg
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  <div className="prediction-cluster-mobile-list">
                    {farm.clusters.map((cluster, index) => {
                      const diff = cluster.actual - cluster.predicted
                      const stageClass = String(cluster.stage || '')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                      return (
                        <article className="prediction-cluster-mobile-card" key={`mobile-${index}`}>
                          <div className="prediction-cluster-mobile-head">
                            <span className="cluster-name-bold">{cluster.name}</span>
                            <span className={`stage-tag stage-${stageClass}`}>{cluster.stage}</span>
                          </div>
                          <div className="prediction-cluster-mobile-grid">
                            <div>
                              <span>Predicted Grade:</span>
                              {' '}
                              {cluster.predictedGrade}
                            </div>
                            <div>
                              <span>Predicted:</span>
                              {' '}
                              {cluster.predicted.toLocaleString()}
                              {' '}
                              kg
                            </div>
                            <div>
                              <span>Actual:</span>
                              {' '}
                              {cluster.actual.toLocaleString()}
                              {' '}
                              kg
                            </div>
                            <div>
                              <span>Previous:</span>
                              {' '}
                              {cluster.previous.toLocaleString()}
                              {' '}
                              kg
                            </div>
                            <div className={diff >= 0 ? 'text-green' : 'text-red'}>
                              <span>Difference:</span>
                              {' '}
                              {diff >= 0 ? '+' : ''}
                              {diff.toLocaleString()}
                              {' '}
                              kg
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )) : (
            <div className="admin-empty-state">
              <TrendingUp size={40} />
              <p>{farmQuery ? 'No farms match this search.' : 'No farm data available for prediction analysis.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
