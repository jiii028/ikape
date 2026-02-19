import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
    Users,
    Sprout,
    Layers,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Download,
    Eye,
    Bell,
    CheckSquare,
    ClipboardList,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    X,
} from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import './AdminDashboard.css'

const RISK_COLORS = { Low: '#22c55e', Moderate: '#f59e0b', High: '#f97316', Critical: '#ef4444' }
const GRADE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b']

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalFarmers: 0,
        totalFarms: 0,
        totalClusters: 0,
        predictedYield: 0,
        actualYield: 0,
        previousYield: 0,
    })
    const [criticalFarms, setCriticalFarms] = useState([])
    const [yieldTrend, setYieldTrend] = useState([])
    const [gradeDistribution, setGradeDistribution] = useState([])
    const [selectedCluster, setSelectedCluster] = useState(null)
    const [auditLogs, setAuditLogs] = useState([])
    const [sortField, setSortField] = useState('riskLevel')
    const [sortDir, setSortDir] = useState('desc')
    const [selectedRows, setSelectedRows] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchDashboardData()
    }, [])

    const fetchDashboardData = async () => {
        setLoading(true)
        try {
            // Fetch total users (farmers)
            const { data: users, error: usersErr } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'farmer')

            // Fetch farms
            const { data: farms, error: farmsErr } = await supabase
                .from('farms')
                .select('id, farm_name, farm_area, user_id')

            // Fetch clusters with stage data
            const { data: clusters, error: clustersErr } = await supabase
                .from('clusters')
                .select('*, cluster_stage_data(*), farms!inner(farm_name, user_id)')

            // Fetch harvest records
            const { data: harvests, error: harvestsErr } = await supabase
                .from('harvest_records')
                .select('*')

            // Compute stats
            const totalFarmers = users?.length || 0
            const totalFarms = farms?.length || 0
            const totalClusters = clusters?.length || 0

            // Compute yields from cluster_stage_data
            let predictedYield = 0
            let actualYield = 0
            let previousYield = 0
            let gradeFine = 0, gradePremium = 0, gradeCommercial = 0

            clusters?.forEach((c) => {
                const sd = c.cluster_stage_data
                if (sd) {
                    predictedYield += parseFloat(sd.predicted_yield || 0)
                    actualYield += parseFloat(sd.current_yield || 0)
                    previousYield += parseFloat(sd.previous_yield || 0)
                    gradeFine += parseFloat(sd.grade_fine || 0)
                    gradePremium += parseFloat(sd.grade_premium || 0)
                    gradeCommercial += parseFloat(sd.grade_commercial || 0)
                }
            })

            setStats({
                totalFarmers,
                totalFarms,
                totalClusters,
                predictedYield: Math.round(predictedYield),
                actualYield: Math.round(actualYield),
                previousYield: Math.round(previousYield),
            })

            // Grade distribution for donut chart
            const totalGrade = gradeFine + gradePremium + gradeCommercial
            setGradeDistribution(totalGrade > 0 ? [
                { name: 'Fine', value: Math.round(gradeFine), pct: ((gradeFine / totalGrade) * 100).toFixed(1) },
                { name: 'Premium', value: Math.round(gradePremium), pct: ((gradePremium / totalGrade) * 100).toFixed(1) },
                { name: 'Commercial', value: Math.round(gradeCommercial), pct: ((gradeCommercial / totalGrade) * 100).toFixed(1) },
            ] : [
                { name: 'Fine', value: 33, pct: '33.3' },
                { name: 'Premium', value: 34, pct: '33.3' },
                { name: 'Commercial', value: 33, pct: '33.3' },
            ])

            // Yield trend (from harvest records, grouped by season)
            const seasonMap = {}
            harvests?.forEach((h) => {
                const season = h.season || 'Unknown'
                if (!seasonMap[season]) seasonMap[season] = { predicted: 0, actual: 0 }
                seasonMap[season].actual += parseFloat(h.yield_kg || 0)
            })
            const trendData = Object.entries(seasonMap).map(([season, vals]) => ({
                season,
                predicted: Math.round(vals.predicted),
                actual: Math.round(vals.actual),
            }))
            setYieldTrend(trendData.length > 0 ? trendData : [
                { season: '2024 Dry', predicted: 0, actual: 0 },
                { season: '2024 Wet', predicted: 0, actual: 0 },
                { season: '2025 Dry', predicted: 0, actual: 0 },
            ])

            // Critical farms: clusters with potential issues
            const critical = clusters?.map((c) => {
                const sd = c.cluster_stage_data
                if (!sd) return null
                const predicted = parseFloat(sd.predicted_yield || 0)
                const actual = parseFloat(sd.current_yield || 0)
                const prev = parseFloat(sd.previous_yield || 0)
                const decline = prev > 0 ? (((prev - actual) / prev) * 100).toFixed(1) : 0
                let risk = 'Low'
                let priority = 1
                if (decline > 50) { risk = 'Critical'; priority = 4 }
                else if (decline > 30) { risk = 'High'; priority = 3 }
                else if (decline > 15) { risk = 'Moderate'; priority = 2 }

                return {
                    id: c.id,
                    farmName: c.farms?.farm_name || 'Unknown Farm',
                    clusterName: c.cluster_name,
                    riskLevel: risk,
                    yieldDecline: parseFloat(decline),
                    priorityScore: priority,
                    soilPh: sd.soil_ph || 'N/A',
                    moisture: sd.bean_moisture || 'N/A',
                    predictedYield: predicted,
                    actualYield: actual,
                    previousYield: prev,
                    plantStage: c.plant_stage,
                    defectCount: sd.defect_count || 0,
                }
            }).filter(Boolean).filter(c => c.riskLevel !== 'Low') || []

            setCriticalFarms(critical)

            // Add initial audit log entries
            setAuditLogs([
                { time: new Date().toLocaleString(), action: 'Dashboard loaded', user: 'Sir Ernesto' },
            ])
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        }
        setLoading(false)
    }

    const addAuditLog = (action) => {
        setAuditLogs((prev) => [
            { time: new Date().toLocaleString(), action, user: 'Sir Ernesto' },
            ...prev,
        ].slice(0, 50))
    }

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
        addAuditLog(`Sorted critical farms by ${field}`)
    }

    const sortedCriticalFarms = [...criticalFarms].sort((a, b) => {
        const riskOrder = { Critical: 4, High: 3, Moderate: 2, Low: 1 }
        let aVal, bVal
        if (sortField === 'riskLevel') {
            aVal = riskOrder[a.riskLevel]; bVal = riskOrder[b.riskLevel]
        } else if (sortField === 'yieldDecline') {
            aVal = a.yieldDecline; bVal = b.yieldDecline
        } else if (sortField === 'priorityScore') {
            aVal = a.priorityScore; bVal = b.priorityScore
        } else {
            aVal = a[sortField]; bVal = b[sortField]
        }
        return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
    })

    const toggleRowSelect = (id) => {
        setSelectedRows((prev) =>
            prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
        )
    }

    const handleBulkAction = (action) => {
        addAuditLog(`Bulk action: ${action} on ${selectedRows.length} cluster(s)`)
        alert(`${action} applied to ${selectedRows.length} cluster(s)`)
        setSelectedRows([])
    }

    const handleExportReport = () => {
        addAuditLog('Exported KPI report')
        alert('KPI report export initiated (CSV)')
    }

    const yieldDiff = stats.actualYield - stats.predictedYield
    const yieldDiffPct = stats.predictedYield > 0
        ? ((yieldDiff / stats.predictedYield) * 100).toFixed(1)
        : 0
    const isOverProduction = yieldDiff >= 0

    if (loading) {
        return (
            <div className="admin-loading">
                <div className="admin-loading-spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        )
    }

    return (
        <div className="admin-dashboard">
            <div className="admin-dash-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Welcome back, Sir Ernesto — Quality Control Manager</p>
                </div>
                <button className="admin-export-btn" onClick={handleExportReport}>
                    <Download size={16} /> Export Report
                </button>
            </div>

            {/* KPI Cards */}
            <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Users size={22} />
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">{stats.totalFarmers}</span>
                        <span className="admin-kpi-label">Registered Farmers</span>
                    </div>
                </div>
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                        <Sprout size={22} />
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">{stats.totalFarms}</span>
                        <span className="admin-kpi-label">Active Farms</span>
                    </div>
                </div>
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                        <Layers size={22} />
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">{stats.totalClusters}</span>
                        <span className="admin-kpi-label">Active Clusters</span>
                    </div>
                </div>
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <TrendingUp size={22} />
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">{stats.predictedYield.toLocaleString()} kg</span>
                        <span className="admin-kpi-label">Predicted Yield (Season)</span>
                    </div>
                </div>
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4' }}>
                        <TrendingDown size={22} />
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">{stats.actualYield.toLocaleString()} kg</span>
                        <span className="admin-kpi-label">Actual Yield (Season)</span>
                    </div>
                </div>
                <div className="admin-kpi-card">
                    <div className="admin-kpi-icon" style={{ background: isOverProduction ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: isOverProduction ? '#22c55e' : '#ef4444' }}>
                        {isOverProduction ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />}
                    </div>
                    <div className="admin-kpi-data">
                        <span className="admin-kpi-value">
                            {isOverProduction ? '+' : ''}{yieldDiffPct}%
                        </span>
                        <span className="admin-kpi-label">
                            {isOverProduction ? 'Over Production' : 'Under Production'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="admin-charts-row">
                {/* Yield Trend Chart */}
                <div className="admin-chart-card">
                    <div className="admin-chart-header">
                        <h3>Yield: Predicted vs Actual (Year-over-Year)</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={yieldTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="season" fontSize={12} tick={{ fill: '#64748b' }} />
                            <YAxis fontSize={12} tick={{ fill: '#64748b' }} />
                            <Tooltip
                                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Predicted" />
                            <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Grade Distribution  */}
                <div className="admin-chart-card admin-chart-card--small">
                    <div className="admin-chart-header">
                        <h3>Coffee Grade Distribution</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={gradeDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={100}
                                dataKey="value"
                                paddingAngle={4}
                            >
                                {gradeDistribution.map((entry, index) => (
                                    <Cell key={entry.name} fill={GRADE_COLORS[index % GRADE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v, name) => [`${v}%`, name]} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Critical Farms Table */}
            <div className="admin-critical-section">
                <div className="admin-critical-header">
                    <div>
                        <h3><AlertTriangle size={18} /> Farms Requiring Immediate Attention</h3>
                        <p>{sortedCriticalFarms.length} cluster(s) flagged</p>
                    </div>
                    {selectedRows.length > 0 && (
                        <div className="admin-bulk-actions">
                            <span>{selectedRows.length} selected</span>
                            <button onClick={() => handleBulkAction('Approve Pest Control')}>
                                <CheckSquare size={14} /> Approve Pest Control
                            </button>
                            <button onClick={() => handleBulkAction('Assign Task')}>
                                <ClipboardList size={14} /> Assign Task
                            </button>
                            <button onClick={() => handleBulkAction('Notify Farmer')}>
                                <Bell size={14} /> Notify Farmer
                            </button>
                        </div>
                    )}
                </div>

                {sortedCriticalFarms.length > 0 ? (
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.length === sortedCriticalFarms.length && sortedCriticalFarms.length > 0}
                                            onChange={() => {
                                                if (selectedRows.length === sortedCriticalFarms.length) {
                                                    setSelectedRows([])
                                                } else {
                                                    setSelectedRows(sortedCriticalFarms.map(c => c.id))
                                                }
                                            }}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('farmName')} className="sortable">Farm Name</th>
                                    <th onClick={() => handleSort('clusterName')} className="sortable">Cluster</th>
                                    <th onClick={() => handleSort('riskLevel')} className="sortable">Risk Level</th>
                                    <th onClick={() => handleSort('yieldDecline')} className="sortable">Yield Decline</th>
                                    <th onClick={() => handleSort('priorityScore')} className="sortable">Priority</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedCriticalFarms.map((farm) => (
                                    <tr key={farm.id}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.includes(farm.id)}
                                                onChange={() => toggleRowSelect(farm.id)}
                                            />
                                        </td>
                                        <td className="farm-name-cell">{farm.farmName}</td>
                                        <td>{farm.clusterName}</td>
                                        <td>
                                            <span className="risk-badge" style={{ background: RISK_COLORS[farm.riskLevel] + '20', color: RISK_COLORS[farm.riskLevel] }}>
                                                {farm.riskLevel}
                                            </span>
                                        </td>
                                        <td className="decline-cell">
                                            <ArrowDownRight size={14} /> {farm.yieldDecline}%
                                        </td>
                                        <td>
                                            <span className={`priority-badge priority-${farm.priorityScore}`}>
                                                P{farm.priorityScore}
                                            </span>
                                        </td>
                                        <td className="action-cell">
                                            <button className="admin-action-btn" onClick={() => { setSelectedCluster(farm); addAuditLog(`Viewed cluster: ${farm.clusterName}`) }}>
                                                <Eye size={14} /> View
                                            </button>
                                            <button className="admin-action-btn admin-action-btn--warn" onClick={() => { addAuditLog(`Assigned task for: ${farm.clusterName}`); alert(`Task assigned for ${farm.clusterName}`) }}>
                                                <ClipboardList size={14} /> Assign
                                            </button>
                                            <button className="admin-action-btn admin-action-btn--info" onClick={() => { addAuditLog(`Notified farmer for: ${farm.clusterName}`); alert(`Farmer notified for ${farm.clusterName}`) }}>
                                                <Bell size={14} /> Notify
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="admin-empty-state">
                        <AlertTriangle size={40} />
                        <p>No critical farms detected. All clusters are healthy.</p>
                    </div>
                )}
            </div>

            {/* Cluster Detail Modal */}
            {selectedCluster && (
                <div className="admin-modal-overlay" onClick={() => setSelectedCluster(null)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2>Cluster Details: {selectedCluster.clusterName}</h2>
                            <button className="admin-modal-close" onClick={() => setSelectedCluster(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="admin-detail-grid">
                                <div className="admin-detail-item">
                                    <label>Farm</label>
                                    <span>{selectedCluster.farmName}</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Risk Level</label>
                                    <span className="risk-badge" style={{ background: RISK_COLORS[selectedCluster.riskLevel] + '20', color: RISK_COLORS[selectedCluster.riskLevel] }}>
                                        {selectedCluster.riskLevel}
                                    </span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Plant Stage</label>
                                    <span>{selectedCluster.plantStage}</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Predicted Yield</label>
                                    <span>{selectedCluster.predictedYield} kg</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Actual Yield</label>
                                    <span>{selectedCluster.actualYield} kg</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Previous Yield</label>
                                    <span>{selectedCluster.previousYield} kg</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Yield Decline</label>
                                    <span style={{ color: '#ef4444' }}>{selectedCluster.yieldDecline}%</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Priority Score</label>
                                    <span className={`priority-badge priority-${selectedCluster.priorityScore}`}>
                                        P{selectedCluster.priorityScore}
                                    </span>
                                </div>
                            </div>

                            <h3 className="admin-detail-section-title">Soil & Health Indicators</h3>
                            <div className="admin-detail-grid">
                                <div className="admin-detail-item">
                                    <label>Soil pH</label>
                                    <span>{selectedCluster.soilPh}</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Bean Moisture</label>
                                    <span>{selectedCluster.moisture}%</span>
                                </div>
                                <div className="admin-detail-item">
                                    <label>Defect Count</label>
                                    <span>{selectedCluster.defectCount}</span>
                                </div>
                            </div>

                            <h3 className="admin-detail-section-title">Recommended Interventions</h3>
                            <ul className="admin-interventions">
                                {selectedCluster.riskLevel === 'Critical' && (
                                    <>
                                        <li>🔴 Immediate soil analysis and pH correction</li>
                                        <li>🔴 Urgent pest control inspection required</li>
                                        <li>🔴 Fertilization schedule adjustment — increase NPK</li>
                                    </>
                                )}
                                {selectedCluster.riskLevel === 'High' && (
                                    <>
                                        <li>🟠 Schedule pruning within 2 weeks</li>
                                        <li>🟠 Apply organic pesticide treatment</li>
                                        <li>🟠 Monitor shade tree density</li>
                                    </>
                                )}
                                {selectedCluster.riskLevel === 'Moderate' && (
                                    <>
                                        <li>🟡 Follow regular fertilization schedule</li>
                                        <li>🟡 Check irrigation levels</li>
                                        <li>🟡 Monitor for early pest signs</li>
                                    </>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Audit Logs */}
            <div className="admin-audit-section">
                <h3><ClipboardList size={16} /> Admin Audit Log</h3>
                <div className="admin-audit-list">
                    {auditLogs.map((log, i) => (
                        <div key={i} className="admin-audit-item">
                            <span className="audit-time">{log.time}</span>
                            <span className="audit-action">{log.action}</span>
                            <span className="audit-user">{log.user}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
