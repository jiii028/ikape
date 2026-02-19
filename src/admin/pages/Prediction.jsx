import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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

export default function Prediction() {
    const [viewMode, setViewMode] = useState('overall') // 'overall' or 'farm'
    const [overallData, setOverallData] = useState([])
    const [farmData, setFarmData] = useState([])
    const [expandedFarm, setExpandedFarm] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPredictionData()
    }, [])

    const fetchPredictionData = async () => {
        setLoading(true)
        try {
            // Fetch all clusters with stage data & farm info
            const { data: clusters, error } = await supabase
                .from('clusters')
                .select('*, cluster_stage_data(*), farms!inner(id, farm_name, user_id, users!inner(first_name, last_name))')

            if (error) throw error

            // Fetch harvest records for historical data
            const { data: harvests } = await supabase
                .from('harvest_records')
                .select('*, clusters!inner(farm_id, farms!inner(farm_name))')

            // --- Overall aggregated data ---
            // Group yields by season from harvest_records
            const seasonMap = {}
            harvests?.forEach((h) => {
                const season = h.season || 'Unknown'
                if (!seasonMap[season]) seasonMap[season] = { season, actual: 0, predicted: 0 }
                seasonMap[season].actual += parseFloat(h.yield_kg || 0)
            })

            // Add predicted yields from cluster_stage_data
            clusters?.forEach((c) => {
                const sd = c.cluster_stage_data
                if (sd?.harvest_season) {
                    if (!seasonMap[sd.harvest_season]) {
                        seasonMap[sd.harvest_season] = { season: sd.harvest_season, actual: 0, predicted: 0 }
                    }
                    seasonMap[sd.harvest_season].predicted += parseFloat(sd.predicted_yield || 0)
                }
            })

            const overall = Object.values(seasonMap).map((s) => ({
                ...s,
                actual: Math.round(s.actual),
                predicted: Math.round(s.predicted),
            }))

            // If no data, show placeholder
            setOverallData(overall.length > 0 ? overall : [
                { season: '2023 Dry', actual: 0, predicted: 0 },
                { season: '2023 Wet', actual: 0, predicted: 0 },
                { season: '2024 Dry', actual: 0, predicted: 0 },
                { season: '2024 Wet', actual: 0, predicted: 0 },
                { season: '2025 Dry', actual: 0, predicted: 0 },
            ])

            // --- Per-farm data ---
            const farmMap = {}
            clusters?.forEach((c) => {
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

                const sd = c.cluster_stage_data
                const predicted = parseFloat(sd?.predicted_yield || 0)
                const actual = parseFloat(sd?.current_yield || 0)
                const previous = parseFloat(sd?.previous_yield || 0)

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

            setFarmData(Object.values(farmMap).map((f) => ({
                ...f,
                totalPredicted: Math.round(f.totalPredicted),
                totalActual: Math.round(f.totalActual),
                totalPrevious: Math.round(f.totalPrevious),
            })))
        } catch (err) {
            console.error('Error fetching prediction data:', err)
        }
        setLoading(false)
    }

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
                    {farmData.length > 0 ? farmData.map((farm) => (
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
                                                return (
                                                    <tr key={i}>
                                                        <td className="cluster-name-bold">{cluster.name}</td>
                                                        <td>
                                                            <span className={`stage-tag stage-${cluster.stage}`}>{cluster.stage}</span>
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
                                </div>
                            )}
                        </div>
                    )) : (
                        <div className="admin-empty-state">
                            <TrendingUp size={40} />
                            <p>No farm data available for prediction analysis.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
