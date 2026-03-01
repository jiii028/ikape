import { useMemo, useState } from 'react'
import { useFarm } from '../../context/FarmContext'
import { useAuth } from '../../context/AuthContext'
import { evaluatePnsCompliance } from '../../lib/pnsCoffeeStandard'
import SystemFlowGuide from '../../components/SystemFlowGuide/SystemFlowGuide'
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Filter,
  TrendingDown,
  TrendingUp,
  Minus,
  Layers,
  X,
} from 'lucide-react'

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toInt(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

function getLocationLabel(user) {
  const municipality = (user?.municipality || '').trim()
  const province = (user?.province || '').trim()
  return [municipality, province].filter(Boolean).join(', ')
}

function inferSeasonTag(harvestSeason) {
  const text = String(harvestSeason || '').toLowerCase()
  if (text.includes('dry') || text.includes('summer')) return 'dry'
  if (text.includes('wet') || text.includes('rain')) return 'wet'
  return 'unknown'
}

function monthsSince(dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
  return months >= 0 ? months : 0
}

function getRecentYieldTrend(harvestRecords = []) {
  const latestThree = harvestRecords
    .map((record) => toNumber(record?.yield_kg))
    .filter((value) => value !== null)
    .slice(0, 3)

  if (latestThree.length < 3) return null

  const [latest, previous, oldest] = latestThree
  if (latest < previous && previous < oldest) {
    const declinePct = oldest > 0 ? ((oldest - latest) / oldest) * 100 : 0
    return { declining: true, declinePct }
  }
  return { declining: false, declinePct: 0 }
}

function buildBenchmarks(clusters) {
  const perTreeYieldSamples = clusters
    .map((cluster) => {
      const plants = toInt(cluster.plantCount)
      const currentYield = toNumber(cluster.stageData?.currentYield)
      if (!plants || !currentYield || plants <= 0) return null
      return currentYield / plants
    })
    .filter((value) => value !== null)

  const avgYieldPerTree = perTreeYieldSamples.length
    ? perTreeYieldSamples.reduce((sum, value) => sum + value, 0) / perTreeYieldSamples.length
    : null

  return {
    avgYieldPerTree,
    samples: perTreeYieldSamples.length,
  }
}

function analyzeCluster(cluster, context) {
  const issues = []
  const sd = cluster.stageData || {}
  const location = context.locationLabel || 'your area'
  const farmName = context.farm?.farm_name || 'your farm'
  const stage = cluster.plantStage || ''
  const seasonTag = inferSeasonTag(sd.harvestSeason)
  const plantCount = toInt(cluster.plantCount) || toInt(sd.numberOfPlants) || 0

  const pH = toNumber(sd.soilPh)
  const temp = toNumber(sd.monthlyTemperature)
  const humidity = toNumber(sd.humidity)
  const rainfall = toNumber(sd.rainfall)
  const prevYield = toNumber(sd.previousYield)
  const currentYield = toNumber(sd.currentYield)

  const latestTrend = getRecentYieldTrend(cluster.harvestRecords || [])
  const pruneGapMonths = monthsSince(sd.lastPrunedDate)
  const benchmarkYieldPerTree = context.benchmarks.avgYieldPerTree
  const clusterYieldPerTree =
    plantCount > 0 && currentYield !== null ? currentYield / plantCount : null
  const pns = evaluatePnsCompliance(sd)

  if (!sd.fertilizerType || sd.fertilizerType === '') {
    const baseDoseKg = plantCount > 0 ? Math.max(10, Math.round((plantCount * 0.25) * 10) / 10) : 25
    issues.push({
      factor: 'Insufficient fertilizer planning',
      severity: 'high',
      explanation: `No fertilizer type is recorded for ${cluster.clusterName}. This reduces yield stability for ${farmName}.`,
      recommendation: `Use a stage-appropriate program in ${location}: start with NPK 14-14-14 and apply about ${baseDoseKg} kg per cycle for this cluster, split into 2-3 applications per season.`,
    })
  }

  if (!sd.pesticideFrequency || sd.pesticideFrequency === '' || sd.pesticideFrequency === 'Never') {
    const severity = seasonTag === 'wet' || (humidity !== null && humidity > 75) ? 'high' : 'medium'
    const scoutInterval = severity === 'high' ? 'every 7 days' : 'every 14 days'
    issues.push({
      factor: 'Pest management risk',
      severity,
      explanation: `Pesticide schedule is missing or inactive. In ${location}, unmanaged pressure increases berry borer and fungal risk.`,
      recommendation: `Start IPM for this cluster: scout ${scoutInterval}, remove infested cherries, and rotate approved ${sd.pesticideType || 'organic'} controls to avoid resistance.`,
    })
  }

  if (sd.pesticideFrequency && sd.pesticideFrequency !== 'Never' && !sd.pesticideType) {
    issues.push({
      factor: 'Pesticide type not specified',
      severity: 'low',
      explanation: 'Application frequency is recorded but pesticide type is missing.',
      recommendation: `Record the pesticide type for traceability in ${farmName}; this enables safer, location-specific treatment advice.`,
    })
  }

  if (pruneGapMonths === null || pruneGapMonths > 12) {
    issues.push({
      factor: 'Pruning schedule not up to date',
      severity: pruneGapMonths !== null && pruneGapMonths > 18 ? 'high' : 'medium',
      explanation:
        pruneGapMonths === null
          ? 'No pruning date has been recorded.'
          : `Last pruning is ${pruneGapMonths} month(s) old, which can reduce light and airflow.`,
      recommendation: stage === 'ready-to-harvest'
        ? 'Plan structural pruning immediately after this harvest window to recover next-season vigor.'
        : 'Schedule pruning in the next 2 weeks, remove unproductive branches, and maintain an open canopy.',
    })
  }

  if (pH !== null && (pH < 5.5 || pH > 6.5)) {
    issues.push({
      factor: 'Imbalanced soil pH',
      severity: pH < 5.0 || pH > 7.0 ? 'high' : 'medium',
      explanation: `Soil pH is ${pH}. Coffee performs best at pH 5.5-6.5.`,
      recommendation: pH < 5.5
        ? `Apply lime in split doses and retest after 8-12 weeks in ${location}.`
        : `Apply sulfur or acid-forming organic inputs, then retest pH next month.`,
    })
  }

  if (sd.shadeTrees === 'No' && temp !== null && temp >= 30) {
    issues.push({
      factor: 'Heat stress exposure',
      severity: 'medium',
      explanation: `Average temperature is ${temp}C with no shade tree coverage recorded.`,
      recommendation: `Increase shade density to 40-60% for this cluster to lower canopy temperature and protect bean quality.`,
    })
  }

  if (humidity !== null && (humidity < 60 || humidity > 75)) {
    issues.push({
      factor: 'Humidity outside optimal range',
      severity: humidity > 85 || humidity < 45 ? 'high' : 'low',
      explanation: `Humidity is ${humidity}%. Coffee performance is usually better around 60-70%.`,
      recommendation: humidity < 60
        ? 'Increase mulching and moisture retention. Prioritize irrigation consistency during dry weeks.'
        : 'Improve airflow through pruning and tighten fungal scouting frequency.',
    })
  }

  if (rainfall !== null) {
    if (rainfall < 100 && seasonTag === 'dry') {
      issues.push({
        factor: 'Dry-season water deficit risk',
        severity: 'medium',
        explanation: `Rainfall is ${rainfall} mm in a dry-season pattern.`,
        recommendation: 'Set supplemental irrigation and mulching now to prevent flowering and fruit drop.',
      })
    } else if (rainfall > 260 && seasonTag === 'wet') {
      issues.push({
        factor: 'Wet-season drainage risk',
        severity: 'medium',
        explanation: `Rainfall is ${rainfall} mm in a wet-season pattern.`,
        recommendation: 'Clear drainage lines, monitor for root stress, and increase disease scouting frequency.',
      })
    }
  }

  if (prevYield !== null && currentYield !== null && prevYield > 0 && currentYield < prevYield * 0.7) {
    const shortfallKg = Math.round((prevYield - currentYield) * 10) / 10
    issues.push({
      factor: 'Significant yield decline detected',
      severity: 'high',
      explanation: `Current yield (${currentYield} kg) is more than 30% below previous yield (${prevYield} kg).`,
      recommendation: `Recover the ${shortfallKg} kg gap by correcting nutrition, tightening pest control, and scheduling a field check this week for ${cluster.clusterName}.`,
    })
  }

  if (
    benchmarkYieldPerTree !== null &&
    clusterYieldPerTree !== null &&
    context.benchmarks.samples >= 2 &&
    clusterYieldPerTree < benchmarkYieldPerTree * 0.8
  ) {
    const benchmarkForCluster = benchmarkYieldPerTree * Math.max(plantCount, 1)
    const gapKg = Math.max(0, benchmarkForCluster - (currentYield || 0))
    issues.push({
      factor: 'Below farm baseline performance',
      severity: 'medium',
      explanation: `${cluster.clusterName} is yielding below your farm average per tree.`,
      recommendation: `This cluster is approximately ${gapKg.toFixed(1)} kg behind farm baseline. Prioritize it for nutrition and pest interventions before lower-risk clusters.`,
    })
  }

  if (latestTrend?.declining) {
    issues.push({
      factor: 'Downward multi-harvest trend',
      severity: latestTrend.declinePct > 35 ? 'high' : 'medium',
      explanation: `Recent harvest records show a ${latestTrend.declinePct.toFixed(1)}% decline over the latest 3 harvests.`,
      recommendation: 'Apply a corrective plan: compare last 3 harvest periods, isolate management changes, and monitor corrective actions monthly.',
    })
  }

  if (pns.complianceStatus !== 'Compliant') {
    issues.push({
      factor: 'PNS quality non-compliance',
      severity: pns.classKey === 'reject' ? 'high' : 'medium',
      explanation: `Latest post-harvest quality is ${pns.complianceStatus} (${pns.qualityClass}) based on PNS/BAFS 01:2025.`,
      recommendation: pns.messages.length > 0
        ? `Address the following: ${pns.messages.join(' ')}`
        : 'Review moisture and defect values against PNS/BAFS 01:2025 limits before final grading.',
    })
  }

  return issues
}

function getPerformanceLevel(issues) {
  const highCount = issues.filter((i) => i.severity === 'high').length
  const medCount = issues.filter((i) => i.severity === 'medium').length

  if (highCount >= 2) return 'poor'
  if (highCount >= 1 || medCount >= 2) return 'moderate'
  return 'good'
}

export default function Recommendations() {
  const { getAllClusters, farm } = useFarm()
  const { user } = useAuth()
  const [performanceFilter, setPerformanceFilter] = useState('')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [mobilePanel, setMobilePanel] = useState('list')

  const allClusters = getAllClusters()
  const locationLabel = useMemo(() => getLocationLabel(user), [user])
  const benchmarks = useMemo(() => buildBenchmarks(allClusters), [allClusters])

  const clustersWithAnalysis = useMemo(
    () =>
      allClusters.map((cluster) => {
        const issues = analyzeCluster(cluster, {
          farm,
          user,
          locationLabel,
          benchmarks,
        })
        return {
          ...cluster,
          issues,
          performance: getPerformanceLevel(issues),
        }
      }),
    [allClusters, benchmarks, farm, locationLabel, user]
  )

  const seasons = [...new Set(allClusters.map((c) => c.stageData?.harvestSeason).filter(Boolean))]

  const sortOrder = { poor: 0, moderate: 1, good: 2 }
  const sorted = [...clustersWithAnalysis].sort(
    (a, b) => sortOrder[a.performance] - sortOrder[b.performance]
  )

  let filtered = performanceFilter
    ? sorted.filter((c) => c.performance === performanceFilter)
    : sorted

  if (seasonFilter) {
    filtered = filtered.filter((c) => c.stageData?.harvestSeason?.includes(seasonFilter))
  }

  const perfConfig = {
    poor: { label: 'Poor', icon: TrendingDown, color: '#dc2626', bg: '#fef2f2' },
    moderate: { label: 'Moderate', icon: Minus, color: '#d97706', bg: '#fffbeb' },
    good: { label: 'Good', icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
  }

  const severityConfig = {
    high: { label: 'High', icon: AlertCircle, color: '#dc2626' },
    medium: { label: 'Medium', icon: AlertTriangle, color: '#d97706' },
    low: { label: 'Low', icon: Lightbulb, color: '#3b82f6' },
  }

  const poorCount = clustersWithAnalysis.filter((c) => c.performance === 'poor').length
  const moderateCount = clustersWithAnalysis.filter((c) => c.performance === 'moderate').length
  const goodCount = clustersWithAnalysis.filter((c) => c.performance === 'good').length

  return (
    <div className="reco-page">
      <div className="reco-header">
        <div>
          <h1>Recommendations</h1>
          <p>
            Priority actions by cluster
            {locationLabel ? ` for ${locationLabel}` : ' for your farm'}
          </p>
        </div>
        <div className="harvest-filters">
          <div className="filter-select">
            <Filter size={16} />
            <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
              <option value="">All Seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chevron" />
          </div>
          <div className="filter-select">
            <Filter size={16} />
            <select value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
              <option value="">All Performance</option>
              <option value="poor">Poor / Declining</option>
              <option value="moderate">Moderate</option>
              <option value="good">Good</option>
            </select>
            <ChevronDown size={14} className="filter-chevron" />
          </div>
        </div>
      </div>

      <div className="reco-summary">
        <div className="reco-sum-card reco-sum-card--critical">
          <AlertCircle size={20} />
          <div>
            <span className="reco-sum-value">{poorCount}</span>
            <span className="reco-sum-label">Critical</span>
          </div>
        </div>
        <div className="reco-sum-card reco-sum-card--moderate">
          <AlertTriangle size={20} />
          <div>
            <span className="reco-sum-value">{moderateCount}</span>
            <span className="reco-sum-label">Needs Work</span>
          </div>
        </div>
        <div className="reco-sum-card reco-sum-card--good">
          <CheckCircle size={20} />
          <div>
            <span className="reco-sum-value">{goodCount}</span>
            <span className="reco-sum-label">Stable</span>
          </div>
        </div>
      </div>

      <SystemFlowGuide mode="decision" />

      <div className="reco-mobile-toggle">
        <button
          type="button"
          className={`reco-mobile-toggle-btn ${mobilePanel === 'list' ? 'active' : ''}`}
          onClick={() => setMobilePanel('list')}
        >
          <Layers size={15} />
          Cluster List
        </button>
        <button
          type="button"
          className={`reco-mobile-toggle-btn ${mobilePanel === 'detail' ? 'active' : ''}`}
          onClick={() => setMobilePanel('detail')}
          disabled={!selectedCluster}
        >
          <Lightbulb size={15} />
          Cluster Details
        </button>
      </div>

      <div className={`reco-content ${mobilePanel === 'detail' ? 'reco-content--detail' : 'reco-content--list'}`}>
        <div className="reco-list">
          {filtered.length === 0 ? (
            <div className="reco-empty">
              <Lightbulb size={48} />
              <h3>No clusters to analyze</h3>
              <p>Add clusters to get actionable recommendations</p>
            </div>
          ) : (
            filtered.map((cluster) => {
              const perf = perfConfig[cluster.performance]
              const PerfIcon = perf.icon
              return (
                <div
                  key={cluster.id}
                  className={`reco-item ${selectedCluster?.id === cluster.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCluster(cluster)
                    setMobilePanel('detail')
                  }}
                >
                  <div className="reco-item-left">
                    <div
                      className="reco-perf-badge"
                      style={{ background: perf.bg, color: perf.color }}
                    >
                      <PerfIcon size={16} />
                    </div>
                    <div>
                      <h4>{cluster.clusterName}</h4>
                      <span className="reco-farm-name">{cluster.plantStage}</span>
                    </div>
                  </div>
                  <div className="reco-item-right">
                    <span className="reco-perf-label" style={{ color: perf.color }}>
                      {perf.label} Yield
                    </span>
                    <span className="reco-issue-count">
                      {cluster.issues.length} issue{cluster.issues.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {selectedCluster && (
          <div className="reco-detail">
            <div className="detail-header">
              <h3>
                <Lightbulb size={18} /> {selectedCluster.clusterName}
              </h3>
              <button
                className="modal-close"
                onClick={() => {
                  setSelectedCluster(null)
                  setMobilePanel('list')
                }}
              >
                <X size={18} />
              </button>
            </div>

            {selectedCluster.issues.length === 0 ? (
              <div className="reco-no-issues">
                <CheckCircle size={32} />
                <h4>No issues identified</h4>
                <p>This cluster is stable. Continue current management practices.</p>
              </div>
            ) : (
              <div className="reco-issues">
                {selectedCluster.issues.map((issue, idx) => {
                  const sev = severityConfig[issue.severity]
                  const SevIcon = sev.icon
                  return (
                    <div key={idx} className="reco-issue-card">
                      <div className="issue-header">
                        <SevIcon size={16} style={{ color: sev.color }} />
                        <span className="issue-factor">{issue.factor}</span>
                        <span className="issue-severity" style={{ color: sev.color }}>
                          {sev.label}
                        </span>
                      </div>
                      <p className="issue-explanation">{issue.explanation}</p>
                      <div className="issue-reco">
                        <span className="reco-tag">Recommendation</span>
                        <p>{issue.recommendation}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
