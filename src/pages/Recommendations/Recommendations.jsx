import { useState, useEffect } from 'react'
import { useFarm } from '../../context/FarmContext'
import { fetchRecommendations } from '../../api/recommend'
import { trackRecommendationAction } from '../../lib/recommendationTracker'
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
  Brain,
  RefreshCw,
} from 'lucide-react'
import './Recommendations.css'

// Rules engine for identifying issues
function analyzeCluster(cluster) {
  const issues = []
  const sd = cluster.stageData || {}

  // Check fertilizer
  if (!sd.fertilizerType || sd.fertilizerType === '') {
    issues.push({
      factor: 'Insufficient fertilizer application',
      severity: 'high',
      explanation: 'No fertilizer type has been recorded. Coffee plants require regular fertilization for optimal yield.',
      recommendation: 'Apply NPK (14-14-14) fertilizer at the start of the rainy season. For mature trees, apply 200-300g per tree, 2-3 times per year.',
    })
  }

  // Check pesticide
  if (!sd.pesticideFrequency || sd.pesticideFrequency === '') {
    issues.push({
      factor: 'Lack of pesticide use',
      severity: 'medium',
      explanation: 'No pesticide application frequency recorded. Plants may be vulnerable to pest infestation.',
      recommendation: 'Conduct regular pest scouting. Apply approved insecticides for Coffee Berry Borer (CBB) prevention. Consider integrated pest management (IPM) practices.',
    })
  }

  // Check pruning
  if (!sd.lastPrunedDate || sd.lastPrunedDate === '') {
    issues.push({
      factor: 'Delayed or missed pruning',
      severity: 'medium',
      explanation: 'No pruning date recorded. Unpruned trees have reduced air circulation and light penetration.',
      recommendation: 'Prune coffee trees annually after harvest season. Remove dead, diseased, and crossing branches. Maintain optimal canopy shape for light exposure.',
    })
  }

  // Check soil pH
  const pH = parseFloat(sd.soilPh)
  if (pH && (pH < 5.5 || pH > 6.5)) {
    issues.push({
      factor: 'Extreme or imbalanced soil pH',
      severity: pH < 5.0 || pH > 7.0 ? 'high' : 'medium',
      explanation: `Soil pH is ${pH}. Coffee thrives in slightly acidic soil (pH 5.5-6.5). Current pH may affect nutrient uptake.`,
      recommendation: pH < 5.5
        ? 'Apply agricultural lime to raise soil pH. Test soil every 6 months to monitor changes.'
        : 'Apply sulfur or organic matter to lower soil pH. Ensure proper drainage to prevent alkalinity buildup.',
    })
  }

  // Check shade trees
  if (sd.shadeTrees === 'No') {
    issues.push({
      factor: 'Poor shade tree management',
      severity: 'low',
      explanation: 'No shade trees present. Shade trees help regulate temperature and improve bean quality.',
      recommendation: 'Plant shade trees like Madre de Cacao (Gliricidia) or Ipil-Ipil at 6-8m spacing. Maintain 40-60% shade coverage for Arabica varieties.',
    })
  }

  // Check temperature
  const temp = parseFloat(sd.monthlyTemperature)
  if (temp && (temp < 15 || temp > 30)) {
    issues.push({
      factor: 'Weather or climate stress',
      severity: 'medium',
      explanation: `Monthly temperature is ${temp}°C. Optimal range for coffee is 15-28°C.`,
      recommendation: temp > 30
        ? 'Increase shade coverage. Consider mulching to reduce soil temperature. Plant windbreaks if exposed to hot winds.'
        : 'Protect young plants with covers during cold periods. Avoid planting in frost-prone areas.',
    })
  }

  // Check yield decline
  const prevYield = parseFloat(sd.previousYield)
  const currentYield = parseFloat(sd.currentYield)
  if (prevYield && currentYield && currentYield < prevYield * 0.7) {
    issues.push({
      factor: 'Significant yield decline detected',
      severity: 'high',
      explanation: `Current yield (${currentYield}kg) is significantly lower than previous yield (${prevYield}kg). A decline of more than 30% warrants investigation.`,
      recommendation: 'Conduct comprehensive soil testing. Review fertilizer program. Check for pest and disease presence. Evaluate pruning schedule and plant age.',
    })
  }

  // Check humidity
  const humidity = parseFloat(sd.humidity)
  if (humidity && (humidity < 60 || humidity > 70)) {
    issues.push({
      factor: 'Non-optimal humidity level',
      severity: humidity < 40 || humidity > 85 ? 'high' : 'low',
      explanation: `Average humidity is ${humidity}%. Optimal range for coffee is 60–70%.`,
      recommendation: humidity < 60
        ? 'Increase mulching around plant bases to retain soil moisture. Consider installing shade structures to reduce evaporation.'
        : 'Improve air circulation through pruning. Ensure adequate spacing between trees. Monitor for fungal diseases common in high-humidity conditions.',
    })
  }

  // Check rainfall
  const rainfall = parseFloat(sd.rainfall)
  if (rainfall && (rainfall < 100 || rainfall > 250)) {
    issues.push({
      factor: 'Abnormal rainfall levels',
      severity: rainfall < 50 || rainfall > 350 ? 'high' : 'medium',
      explanation: `Monthly rainfall is ${rainfall}mm. Coffee generally needs 100–250mm of monthly rainfall for healthy growth.`,
      recommendation: rainfall < 100
        ? 'Consider supplemental irrigation during dry spells. Apply mulch to conserve soil moisture.'
        : 'Ensure proper drainage to prevent waterlogging and root rot. Check for erosion on slopes.',
    })
  }

  // Check fertilizer frequency
  if (sd.fertilizerFrequency === 'Never' || sd.fertilizerFrequency === 'Rarely') {
    issues.push({
      factor: 'Infrequent fertilizer application',
      severity: sd.fertilizerFrequency === 'Never' ? 'high' : 'medium',
      explanation: `Fertilizer application is "${sd.fertilizerFrequency}". Inadequate fertilization leads to nutrient deficiency and reduced yields.`,
      recommendation: 'Apply fertilizer at least once a year. Recommended schedule: NPK at start of rainy season, and organic compost mid-season. Increase to 3-4 times per year for mature bearing trees.',
    })
  }

  // Check pesticide type missing
  if (sd.pesticideFrequency && sd.pesticideFrequency !== 'Never' && !sd.pesticideType) {
    issues.push({
      factor: 'Pesticide type not specified',
      severity: 'low',
      explanation: 'Pesticide application frequency is recorded but the type (Organic/Non-Organic) is not specified.',
      recommendation: 'Record the pesticide type for better tracking. Consider switching to organic pesticides where possible for sustainable farming.',
    })
  }

  return issues
}

function getPerformanceLevel(cluster) {
  const issues = analyzeCluster(cluster)
  const highCount = issues.filter((i) => i.severity === 'high').length
  const medCount = issues.filter((i) => i.severity === 'medium').length

  if (highCount >= 2) return 'poor'
  if (highCount >= 1 || medCount >= 2) return 'moderate'
  return 'good'
}

// Convert cluster data to ML features
function clusterToMLFeatures(cluster) {
  const sd = cluster.stageData || {}
  return {
    plant_age_months: parseFloat(sd.plantAgeMonths) || 24,
    number_of_plants: parseInt(sd.treeCount) || 100,
    fertilizer_type: sd.fertilizerType || 'none',
    fertilizer_frequency: sd.fertilizerFrequency || 'never',
    pesticide_type: sd.pesticideType || 'none',
    pesticide_frequency: sd.pesticideFrequency || 'never',
    pruning_interval_months: parseFloat(sd.lastPrunedDate ? 
      ((new Date() - new Date(sd.lastPrunedDate)) / (1000 * 60 * 60 * 24 * 30)) : 12) || 12,
    shade_tree_present: sd.shadeTrees === 'Yes',
    soil_ph: parseFloat(sd.soilPh) || 6.0,
    avg_temp_c: parseFloat(sd.monthlyTemperature) || 25,
    avg_rainfall_mm: parseFloat(sd.rainfall) || 150,
    avg_humidity_pct: parseFloat(sd.humidity) || 65,
    elevation_m: parseFloat(sd.elevation) || 1000,
    previous_yield_per_tree: parseFloat(sd.previousYield) / parseInt(sd.treeCount) || 1.0,
    previous_quality_score: 50, // Default quality score
    yield_trend: 0 // Neutral trend by default
  }
}

// Fetch ML recommendations for a cluster
async function fetchMLRecommendations(clusterId, features, setRecommendations, setLoading, setError) {
  setLoading(prev => ({ ...prev, [clusterId]: true }))
  setError(prev => ({ ...prev, [clusterId]: null }))
  
  try {
    const result = await fetchRecommendations(clusterId, features)
    setRecommendations(prev => ({ ...prev, [clusterId]: result.recommendations || [] }))
  } catch (err) {
    console.error('ML recommendation error:', err)
    setError(prev => ({ ...prev, [clusterId]: err.message }))
  } finally {
    setLoading(prev => ({ ...prev, [clusterId]: false }))
  }
}

// Handle accept/reject user actions
function handleUserAction(clusterId, recType, action) {
  setUserActions(prev => ({
    ...prev,
    [`${clusterId}-${recType}`]: action
  }))
  
  // Track action for later sync
  trackRecommendationAction({
    cluster_id: clusterId,
    recommendation_type: recType,
    action: action,
    timestamp: new Date().toISOString()
  })
}

export default function Recommendations() {
  const { getAllClusters } = useFarm()
  const [performanceFilter, setPerformanceFilter] = useState('')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [mobilePanel, setMobilePanel] = useState('list')
  
  // ML Recommendation state
  const [mlRecommendations, setMlRecommendations] = useState({})
  const [mlLoading, setMlLoading] = useState({})
  const [mlError, setMlError] = useState({})
  const [showWhyThis, setShowWhyThis] = useState({}) // Track which recommendations have expanded 'why' section
  const [userActions, setUserActions] = useState({}) // Track accept/reject status

  const allClusters = getAllClusters()
  
  // Fetch ML recommendations when cluster is selected
  useEffect(() => {
    if (!selectedCluster || mlRecommendations[selectedCluster.id]) return
    
    const features = clusterToMLFeatures(selectedCluster)
    fetchMLRecommendations(
      selectedCluster.id,
      features,
      setMlRecommendations,
      setMlLoading,
      setMlError
    )
  }, [selectedCluster])
  const clustersWithAnalysis = allClusters.map((c) => ({
    ...c,
    issues: analyzeCluster(c),
    performance: getPerformanceLevel(c),
  }))

  // Get unique seasons
  const seasons = [...new Set(allClusters.map((c) => c.stageData?.harvestSeason).filter(Boolean))]

  // Sort by urgency
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
          <p>Priority actions by cluster</p>
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

      {/* Summary Cards */}
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

      {/* Cluster List with Performance */}
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
                    <span
                      className="reco-perf-label"
                      style={{ color: perf.color }}
                    >
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

        {/* Detail Overlay */}
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

            {/* ML Recommendations Section */}
            {mlLoading[selectedCluster.id] ? (
              <div className="ml-loading">
                <Brain size={20} className="spin" />
                <span>Analyzing with ML...</span>
              </div>
            ) : mlRecommendations[selectedCluster.id]?.length > 0 ? (
              <div className="ml-recommendations">
                <div className="ml-header">
                  <Brain size={18} />
                  <h4>AI Recommendations</h4>
                  <span className="ml-badge">ML Powered</span>
                </div>
                {mlRecommendations[selectedCluster.id].map((rec, idx) => {
                  const confidencePct = Math.round(rec.confidence * 100)
                  const actionKey = `${selectedCluster.id}-${rec.type}`
                  const userAction = userActions[actionKey]
                  
                  // Get recommendation details based on type
                  const recDetails = {
                    fertilizer: { title: 'Apply Fertilizer', icon: '🌱', desc: 'Optimize nutrient application' },
                    pesticide: { title: 'Pest Control', icon: '🐛', desc: 'Address pest concerns' },
                    pruning: { title: 'Schedule Pruning', icon: '✂️', desc: 'Improve plant health' },
                    shade: { title: 'Manage Shade', icon: '🌳', desc: 'Optimize light exposure' },
                    irrigation: { title: 'Water Management', icon: '💧', desc: 'Optimize irrigation' },
                    soil_amendment: { title: 'Soil Amendment', icon: '🪨', desc: 'Improve soil conditions' }
                  }
                  const details = recDetails[rec.type] || { title: rec.type, icon: '📋', desc: '' }
                  
                  return (
                    <div key={idx} className={`ml-rec-card ${userAction ? `action-${userAction}` : ''}`}>
                      <div className="ml-rec-header">
                        <span className="ml-rec-icon">{details.icon}</span>
                        <div className="ml-rec-title">
                          <span className="ml-rec-type">{details.title}</span>
                          <span className="ml-rec-desc">{details.desc}</span>
                        </div>
                        <div className={`ml-confidence ${confidencePct >= 70 ? 'high' : confidencePct >= 40 ? 'medium' : 'low'}`}>
                          {confidencePct}% confidence
                        </div>
                      </div>
                      
                      {/* Confidence bar */}
                      <div className="ml-confidence-bar">
                        <div 
                          className="ml-confidence-fill" 
                          style={{ width: `${confidencePct}%` }}
                        />
                      </div>
                      
                      {/* User Action Buttons */}
                      <div className="ml-rec-actions">
                        {userAction ? (
                          <span className={`ml-action-done ${userAction}`}>
                            {userAction === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                          </span>
                        ) : (
                          <>
                            <button 
                              className="ml-action-btn accept"
                              onClick={() => handleUserAction(selectedCluster.id, rec.type, 'accepted')}
                            >
                              ✓ Accept
                            </button>
                            <button 
                              className="ml-action-btn reject"
                              onClick={() => handleUserAction(selectedCluster.id, rec.type, 'rejected')}
                            >
                              ✗ Decline
                            </button>
                          </>
                        )}
                      </div>
                      
                      {/* Why This Recommendation Toggle */}
                      <button 
                        className="ml-why-toggle"
                        onClick={() => setShowWhyThis(prev => ({
                          ...prev,
                          [`${selectedCluster.id}-${rec.type}`]: !prev[`${selectedCluster.id}-${rec.type}`]
                        }))}
                      >
                        <ChevronDown size={14} />
                        Why this recommendation?
                      </button>
                      
                      {/* Why This Explanation */}
                      {showWhyThis[`${selectedCluster.id}-${rec.type}`] && (
                        <div className="ml-why-content">
                          <p><strong>Based on your cluster's data:</strong></p>
                          <ul>
                            <li>Plant age: {selectedCluster.stageData?.plantAgeMonths || 'N/A'} months</li>
                            <li>Soil pH: {selectedCluster.stageData?.soilPh || 'N/A'}</li>
                            <li>Current fertilizer: {selectedCluster.stageData?.fertilizerType || 'None'}</li>
                            <li>Humidity: {selectedCluster.stageData?.humidity || 'N/A'}%</li>
                          </ul>
                          <p className="ml-model-info">
                            <small>ML Model: RandomForest | Prediction class: {rec.predicted_class}</small>
                          </p>
                        </div>
                      )}
                      
                      {rec.is_rule_based && (
                        <span className="ml-fallback-badge">Rule-based fallback</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : mlError[selectedCluster.id] ? (
              <div className="ml-error">
                <AlertCircle size={16} />
                <span>ML unavailable: {mlError[selectedCluster.id]}</span>
              </div>
            ) : null}

            {/* Existing Rule-based Issues */}
            <div className="rule-issues-header">
              <h4>Rule-Based Analysis</h4>
            </div>

            {selectedCluster.issues.length === 0 ? (
              <div className="reco-no-issues">
                <CheckCircle size={32} />
                <h4>No issues identified</h4>
                <p>This cluster is performing well. Continue current management practices.</p>
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
