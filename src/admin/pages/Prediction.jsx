import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getCached, setCached } from '../../lib/queryCache'
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
    ResponsiveContainer, LineChart, Line,
} from 'recharts'
import './Prediction.css'

const PREDICTION_CACHE_KEY = 'admin_prediction:overview'
const PREDICTION_CACHE_TTL_MS = 2 * 60 * 1000

export default function Prediction() {
    const [searchParams] = useSearchParams()
    const [viewMode, setViewMode] = useState('overall') // 'overall' or 'farm'
    const [overallData, setOverallData] = useState([])
    const [farmData, setFarmData] = useState([])
    const [expandedFarm, setExpandedFarm] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPredictionData()
    }, [])

    useEffect(() => {
        const requestedView = searchParams.get('view')
        if (requestedView === 'farm' || requestedView === 'overall') {
            setViewMode(requestedView)
        }
    }, [searchParams])

    const fetchPredictionData = async () => {
        const cached = getCached(PREDICTION_CACHE_KEY, PREDICTION_CACHE_TTL_MS)
        if (cached) {
            setOverallData(cached.overallData)
            setFarmData(cached.farmData)
            setLoading(false)
        } else {
            setLoading(true)
        }

        try {
            const [clustersRes, harvestsRes] = await Promise.all([
                supabase
                    .from('clusters')
                    .select('*, cluster_stage_data(*), farms!inner(id, farm_name, user_id, users!inner(first_name, last_name))'),
                supabase
                    .from('harvest_records')
                    .select('*, clusters!inner(farm_id, farms!inner(farm_name))'),
            ])

            if (clustersRes.error || harvestsRes.error) {
                throw clustersRes.error || harvestsRes.error
            }

            const clusters = (clustersRes.data || []).map((c) => ({
                ...c,
                stageData: Array.isArray(c.cluster_stage_data) ? c.cluster_stage_data[0] : c.cluster_stage_data,
            }))
            const harvests = harvestsRes.data || []
            const clusterActualYieldMap = new Map()

            harvests.forEach((record) => {
                const clusterId = record.cluster_id
                if (!clusterId) return
                const nextTotal = (clusterActualYieldMap.get(clusterId) || 0) + parseFloat(record.yield_kg || 0)
                clusterActualYieldMap.set(clusterId, nextTotal)
            })

            // --- Overall aggregated data ---
            // Group yields by season from harvest_records
            const seasonMap = {}
            harvests.forEach((h) => {
                const season = h.season || 'Unknown'
                if (!seasonMap[season]) seasonMap[season] = { season, actual: 0, predicted: 0 }
                seasonMap[season].actual += parseFloat(h.yield_kg || 0)
            })

            // Add predicted yields from cluster_stage_data
            clusters.forEach((c) => {
                const sd = c.stageData
                const season = sd?.season || sd?.harvest_season
                if (season) {
                    if (!seasonMap[season]) {
                        seasonMap[season] = { season, actual: 0, predicted: 0 }
                    }
                    seasonMap[season].predicted += parseFloat(sd.predicted_yield || 0)
                }
            })

            const overall = Object.values(seasonMap).map((s) => ({
                ...s,
                actual: Math.round(s.actual),
                predicted: Math.round(s.predicted),
            }))

            // If no data, show placeholder
            const nextOverallData = overall.length > 0 ? overall : [
                { season: '2023 Dry', actual: 0, predicted: 0 },
                { season: '2023 Wet', actual: 0, predicted: 0 },
                { season: '2024 Dry', actual: 0, predicted: 0 },
                { season: '2024 Wet', actual: 0, predicted: 0 },
                { season: '2025 Dry', actual: 0, predicted: 0 },
            ]
            setOverallData(nextOverallData)

            // --- Per-farm data ---
            const farmMap = {}
            clusters.forEach((c) => {
                const farm = c.farms
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

                const sd = c.stageData
                const predicted = parseFloat(sd?.predicted_yield || 0)
                const actual = clusterActualYieldMap.get(c.id) || parseFloat(sd?.current_yield || 0)
                const previous = parseFloat((sd?.pre_yield_kg ?? sd?.previous_yield) || 0)

                farmMap[farmId].clusters.push({
                    name: c.cluster_name,
                    predicted: Math.round(predicted),
                    actual: Math.round(actual),
                    previous: Math.round(previous),
                    stage: c.plant_stage,
                })
                farmMap[farmId].totalPredicted += predicted
                farmMap[farmId].totalActual += actual
                farmMap[farmId].totalPrevious += previous
            })

            const nextFarmData = Object.values(farmMap).map((f) => ({
                ...f,
                totalPredicted: Math.round(f.totalPredicted),
                totalActual: Math.round(f.totalActual),
                totalPrevious: Math.round(f.totalPrevious),
            }))
            setFarmData(nextFarmData)

            setCached(PREDICTION_CACHE_KEY, {
                overallData: nextOverallData,
                farmData: nextFarmData,
            })
        } catch (err) {
            console.error('Error fetching prediction data:', err)
        }
        setLoading(false)
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
                    <p>Overall yield analysis and per-farm comparison</p>
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
                        <Download size={16} /> Export CSV
                    </button>
                </div>
            </div>

            {viewMode === 'overall' ? (
                /* ===== OVERALL VIEW ===== */
                <div className="prediction-overall">
                    <div className="prediction-chart-card">
                        <h3><TrendingUp size={18} /> Multi-Year Yield Comparison</h3>
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

                    {/* Summary Cards */}
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
                                        {diff >= 0 ? '+' : ''}{pct}% {diff >= 0 ? 'Over' : 'Under'}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                /* ===== PER-FARM VIEW ===== */
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
                                    <table className="prediction-cluster-table">
                                        <thead>
                                            <tr>
                                                <th>Cluster</th>
                                                <th>Stage</th>
                                                <th>Predicted (kg)</th>
                                                <th>Actual (kg)</th>
                                                <th>Previous (kg)</th>
                                                <th>Difference</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {farm.clusters.map((cluster, i) => {
                                                const diff = cluster.actual - cluster.predicted
                                                const stageClass = String(cluster.stage || '')
                                                    .toLowerCase()
                                                    .replace(/[^a-z0-9]+/g, '-')
                                                return (
                                                    <tr key={i}>
                                                        <td className="cluster-name-bold">{cluster.name}</td>
                                                        <td>
                                                            <span className={`stage-tag stage-${stageClass}`}>{cluster.stage}</span>
                                                        </td>
                                                        <td>{cluster.predicted.toLocaleString()}</td>
                                                        <td>{cluster.actual.toLocaleString()}</td>
                                                        <td>{cluster.previous.toLocaleString()}</td>
                                                        <td className={diff >= 0 ? 'text-green' : 'text-red'}>
                                                            {diff >= 0 ? '+' : ''}{diff.toLocaleString()} kg
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>

                                    <div className="prediction-cluster-mobile-list">
                                        {farm.clusters.map((cluster, i) => {
                                            const diff = cluster.actual - cluster.predicted
                                            const stageClass = String(cluster.stage || '')
                                                .toLowerCase()
                                                .replace(/[^a-z0-9]+/g, '-')
                                            return (
                                                <article className="prediction-cluster-mobile-card" key={`mobile-${i}`}>
                                                    <div className="prediction-cluster-mobile-head">
                                                        <span className="cluster-name-bold">{cluster.name}</span>
                                                        <span className={`stage-tag stage-${stageClass}`}>{cluster.stage}</span>
                                                    </div>
                                                    <div className="prediction-cluster-mobile-grid">
                                                        <div><span>Predicted:</span> {cluster.predicted.toLocaleString()} kg</div>
                                                        <div><span>Actual:</span> {cluster.actual.toLocaleString()} kg</div>
                                                        <div><span>Previous:</span> {cluster.previous.toLocaleString()} kg</div>
                                                        <div className={diff >= 0 ? 'text-green' : 'text-red'}>
                                                            <span>Difference:</span> {diff >= 0 ? '+' : ''}{diff.toLocaleString()} kg
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
