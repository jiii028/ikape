import { useState, useMemo } from 'react'
import { useFarm } from '../../context/FarmContext'
import {
  BarChart3,
  Filter,
  ChevronDown,
  X,
  TrendingUp,
  Coffee,
  Layers,
  Calendar,
  Mountain,
  History,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import './HarvestRecords.css'

const GRADE_COLORS = ['#2d5a2d', '#7bc67b', '#fbbf24']

export default function HarvestRecords() {
  const { getAllClusters, farm } = useFarm()
  const [seasonFilter, setSeasonFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [mobileView, setMobileView] = useState('list')
  const [viewMode, setViewMode] = useState('current')

  // Get all clusters with harvest records (historical or current)
  const allClusters = getAllClusters()
  
  // Get clusters with any harvest data
  const clustersWithHarvests = useMemo(() => {
    return allClusters.filter((c) => 
      c.harvestRecords?.length > 0 || 
      c.stageData?.currentYield || 
      c.stageData?.previousYield
    )
  }, [allClusters])

  // Get unique years from historical harvest records
  const allYears = useMemo(() => {
    const years = new Set()
    clustersWithHarvests.forEach(cluster => {
      cluster.harvestRecords?.forEach(record => {
        if (record.actual_harvest_date) {
          years.add(new Date(record.actual_harvest_date).getFullYear())
        }
      })
    })
    return [...years].sort((a, b) => b - a)
  }, [clustersWithHarvests])

  // Filter clusters
  const filteredClusters = useMemo(() => {
    let filtered = clustersWithHarvests
    
    if (seasonFilter) {
      filtered = filtered.filter((c) => c.stageData?.harvestSeason?.includes(seasonFilter))
    }
    
    if (yearFilter) {
      filtered = filtered.filter((c) => 
        c.harvestRecords?.some(r => {
          if (!r.actual_harvest_date) return false
          return new Date(r.actual_harvest_date).getFullYear().toString() === yearFilter
        })
      )
    }
    
    return filtered
  }, [clustersWithHarvests, seasonFilter, yearFilter])

  // Get unique seasons from stageData
  const seasons = [...new Set(allClusters.map((c) => c.stageData?.harvestSeason).filter(Boolean))]

  // Generate historical yield trend data
  const getHistoricalYieldData = () => {
    if (!selectedCluster?.harvestRecords?.length) return []
    
    return selectedCluster.harvestRecords
      .filter(r => r.actual_harvest_date)
      .sort((a, b) => new Date(a.actual_harvest_date) - new Date(b.actual_harvest_date))
      .map((r, index) => ({
        name: `H${index + 1}`,
        date: new Date(r.actual_harvest_date).toLocaleDateString(),
        yield: parseFloat(r.yield_kg) || 0,
        predicted: parseFloat(r.predicted_yield) || 0,
      }))
  }

  // Generate yield by year data
  const getYieldByYearData = () => {
    if (!selectedCluster?.harvestRecords?.length) return []
    
    const yearData = {}
    selectedCluster.harvestRecords.forEach(record => {
      if (!record.actual_harvest_date) return
      const year = new Date(record.actual_harvest_date).getFullYear()
      if (!yearData[year]) {
        yearData[year] = { year, totalYield: 0, count: 0 }
      }
      yearData[year].totalYield += parseFloat(record.yield_kg) || 0
      yearData[year].count += 1
    })
    
    return Object.values(yearData)
      .sort((a, b) => a.year - b.year)
      .map(d => ({
        name: d.year.toString(),
        yield: Math.round(d.totalYield),
        previous: 0,
        predicted: 0,
        actual: Math.round(d.totalYield),
      }))
  }

  // Generate grade distribution from historical records
  const getHistoricalGradeData = () => {
    if (!selectedCluster?.harvestRecords?.length) return []
    
    const totals = { fine: 0, premium: 0, commercial: 0 }
    let count = 0
    
    selectedCluster.harvestRecords.forEach(r => {
      if (r.fine_pct || r.premium_pct || r.commercial_pct) {
        totals.fine += r.fine_pct || 0
        totals.premium += r.premium_pct || 0
        totals.commercial += r.commercial_pct || 0
        count++
      }
    })
    
    if (count === 0) return []
    
    return [
      { name: 'Fine', value: Math.round(totals.fine / count) },
      { name: 'Premium', value: Math.round(totals.premium / count) },
      { name: 'Commercial', value: Math.round(totals.commercial / count) },
    ].filter((d) => d.value > 0)
  }

  // Current yield data
  const getYieldChartData = (cluster) => {
    if (viewMode === 'history' && cluster?.harvestRecords?.length > 0) {
      return getYieldByYearData()
    }
    if (!cluster?.stageData) return []
    return [
      { name: 'Previous', yield: parseFloat(cluster.stageData.previousYield) || 0 },
      { name: 'Predicted', yield: parseFloat(cluster.stageData.predictedYield) || 0 },
      { name: 'Actual', yield: parseFloat(cluster.stageData.currentYield) || 0 },
    ]
  }

  const getGradeData = (cluster) => {
    if (viewMode === 'history' && cluster?.harvestRecords?.length > 0) {
      return getHistoricalGradeData()
    }
    if (!cluster?.stageData) return []
    return [
      { name: 'Fine', value: parseFloat(cluster.stageData.gradeFine) || 0 },
      { name: 'Premium', value: parseFloat(cluster.stageData.gradePremium) || 0 },
      { name: 'Commercial', value: parseFloat(cluster.stageData.gradeCommercial) || 0 },
    ].filter((d) => d.value > 0)
  }

  const stageLabels = {
    'ready-to-harvest': 'Ready to Harvest',
    'flowering': 'Flowering',
    'fruit-bearing': 'Fruit-bearing',
    'seed-sapling': 'Sapling',
    'tree': 'Tree',
  }

  const getPlantAge = (datePlanted) => {
    if (!datePlanted) return 'N/A'
    const planted = new Date(datePlanted)
    const now = new Date()
    const years = Math.floor((now - planted) / (365.25 * 24 * 60 * 60 * 1000))
    const months = Math.floor(((now - planted) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
    if (years > 0) return `${years}y ${months}m`
    return `${months}m`
  }

  // Calculate total yield for a cluster
  const getTotalYield = (cluster) => {
    return cluster.harvestRecords?.reduce((sum, r) => sum + (parseFloat(r.yield_kg) || 0), 0) || 0
  }

  // Calculate average yield per harvest
  const getAverageYield = (cluster) => {
    if (!cluster.harvestRecords?.length) return 0
    return getTotalYield(cluster) / cluster.harvestRecords.length
  }

  return (
    <div className="harvest-page">
      <header className="harvest-header">
        <div>
          <h1>Harvest Records</h1>
          <p>Track and analyze your coffee harvests</p>
        </div>
        <div className="harvest-filters">
          <div className="filter-select">
            <Filter size={14} />
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
            >
              <option value="">All Seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chevron" />
          </div>
          
          <div className="filter-select">
            <Calendar size={14} />
            <select 
              value={yearFilter} 
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="">All Years</option>
              {allYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chevron" />
          </div>
          
          {(seasonFilter || yearFilter) && (
            <button
              className="clear-filters"
              onClick={() => {
                setSeasonFilter('')
                setYearFilter('')
              }}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
      </header>

      <div className="harvest-mobile-toggle">
        <button
          className={`harvest-mobile-toggle-btn ${mobileView === 'list' ? 'active' : ''}`}
          onClick={() => setMobileView('list')}
          disabled={mobileView === 'list'}
        >
          <Mountain size={14} /> Clusters
        </button>
        <button
          className={`harvest-mobile-toggle-btn ${mobileView === 'detail' ? 'active' : ''}`}
          onClick={() => setMobileView('detail')}
          disabled={mobileView === 'detail' || !selectedCluster}
        >
          <BarChart3 size={14} /> Details
        </button>
      </div>

      <div className={`harvest-content harvest-content--${mobileView}`}>
        {/* Cluster List Panel */}
        <div className="cluster-list-panel">
          <h3>Clusters ({filteredClusters.length})</h3>
          <div className="cluster-list">
            {filteredClusters.length === 0 ? (
              <div className="cluster-list-empty">
                No clusters with harvest data
              </div>
            ) : (
              filteredClusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className={`cluster-list-item ${selectedCluster?.id === cluster.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCluster(cluster)
                    setMobileView('detail')
                  }}
                >
                  <div className="cli-top">
                    <span className="cli-name">{cluster.clusterName}</span>
                    <span className={`cli-stage cli-stage--${cluster.plantStage}`}>
                      {stageLabels[cluster.plantStage] || cluster.plantStage}
                    </span>
                  </div>
                  <div className="cli-details">
                    <span>
                      <Coffee size={12} /> {cluster.variety || 'N/A'}
                    </span>
                    <span>
                      <Layers size={12} /> {cluster.plantCount} trees
                    </span>
                    {cluster.harvestRecords?.length > 0 && (
                      <span>
                        <History size={12} /> {cluster.harvestRecords.length} harvests
                      </span>
                    )}
                  </div>
                  {cluster.harvestRecords?.length > 0 && (
                    <div className="cli-yield">
                      Total: {Math.round(getTotalYield(cluster))} kg | Avg: {Math.round(getAverageYield(cluster))} kg
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="cluster-detail-panel">
          {!selectedCluster ? (
            <div className="detail-empty">
              <BarChart3 size={48} />
              <h3>Select a cluster</h3>
              <p>Choose a cluster to view harvest analytics</p>
            </div>
          ) : (
            <div className="detail-content">
              {/* View Toggle */}
              <div className="detail-header">
                <h3>{selectedCluster.clusterName}</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setViewMode('current')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: viewMode === 'current' ? '#f0fdf4' : 'var(--bg-card)',
                      color: viewMode === 'current' ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setViewMode('history')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: viewMode === 'history' ? '#f0fdf4' : 'var(--bg-card)',
                      color: viewMode === 'history' ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    History ({selectedCluster.harvestRecords?.length || 0})
                  </button>
                </div>
              </div>

              {/* Info Grid */}
              <div className="detail-section">
                <h4><Coffee size={16} /> Cluster Information</h4>
                <div className="detail-info-grid">
                  <div className="info-item">
                    <span className="info-label">Variety</span>
                    <span className="info-value">{selectedCluster.variety || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Plant Count</span>
                    <span className="info-value">{selectedCluster.plantCount}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Plant Age</span>
                    <span className="info-value">{getPlantAge(selectedCluster.stageData?.datePlanted)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Stage</span>
                    <span className="info-value">{stageLabels[selectedCluster.plantStage] || selectedCluster.plantStage}</span>
                  </div>
                </div>
              </div>

              {/* Historical Yield Trend */}
              {viewMode === 'history' && selectedCluster.harvestRecords?.length > 0 && (
                <div className="detail-section">
                  <h4><TrendingUp size={16} /> Historical Yield Trend</h4>
                  <div className="chart-card">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={getHistoricalYieldData()}>
                        <defs>
                          <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2d5a2d" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#2d5a2d" stopOpacity={0.2}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value, name) => [`${value} kg`, name === 'yield' ? 'Actual' : 'Predicted']}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.date || label}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="yield" 
                          stroke="#2d5a2d" 
                          fillOpacity={1} 
                          fill="url(#colorYield)" 
                          name="Actual Yield"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="predicted" 
                          stroke="#fbbf24" 
                          strokeDasharray="5 5"
                          dot={false}
                          name="Predicted"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Yield Summary - Current */}
              {viewMode === 'current' && (
                <div className="detail-section">
                  <h4><TrendingUp size={16} /> Yield Summary</h4>
                  <div className="yield-summary">
                    <div className="yield-card">
                      <span className="yield-label">Previous</span>
                      <span className="yield-value">
                        {selectedCluster.stageData?.previousYield || '0'} kg
                      </span>
                    </div>
                    <div className="yield-card yield-card--predicted">
                      <span className="yield-label">Predicted</span>
                      <span className="yield-value">
                        {selectedCluster.stageData?.predictedYield || '0'} kg
                      </span>
                    </div>
                    <div className="yield-card yield-card--actual">
                      <span className="yield-label">Actual</span>
                      <span className="yield-value">
                        {selectedCluster.stageData?.currentYield || '0'} kg
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Summary */}
              {viewMode === 'history' && selectedCluster.harvestRecords?.length > 0 && (
                <div className="detail-section">
                  <h4><History size={16} /> Historical Summary</h4>
                  <div className="yield-summary">
                    <div className="yield-card">
                      <span className="yield-label">Total Harvests</span>
                      <span className="yield-value">{selectedCluster.harvestRecords.length}</span>
                    </div>
                    <div className="yield-card yield-card--predicted">
                      <span className="yield-label">Total Yield</span>
                      <span className="yield-value">{Math.round(getTotalYield(selectedCluster))} kg</span>
                    </div>
                    <div className="yield-card yield-card--actual">
                      <span className="yield-label">Average</span>
                      <span className="yield-value">{Math.round(getAverageYield(selectedCluster))} kg</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts Grid */}
              <div className="detail-section">
                <h4><BarChart3 size={16} /> Analytics</h4>
                <div className="charts-grid">
                  <div className="chart-card">
                    <h5>{viewMode === 'history' ? 'Yield by Year' : 'Yield Comparison'}</h5>
                    {getYieldChartData(selectedCluster).length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={getYieldChartData(selectedCluster)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value) => `${value} kg`} />
                          <Bar dataKey="yield" fill="#2d5a2d" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chart-empty">No yield data</div>
                    )}
                  </div>

                  <div className="chart-card">
                    <h5>Grade Distribution</h5>
                    {getGradeData(selectedCluster).length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={getGradeData(selectedCluster)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                          >
                            {getGradeData(selectedCluster).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={GRADE_COLORS[index % GRADE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${value}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chart-empty">No grade data</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Harvest History Table */}
              {viewMode === 'history' && selectedCluster.harvestRecords?.length > 0 && (
                <div className="detail-section">
                  <h4><Calendar size={16} /> Harvest History</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                          <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '8px' }}>Yield (kg)</th>
                          <th style={{ textAlign: 'right', padding: '8px' }}>Fine %</th>
                          <th style={{ textAlign: 'right', padding: '8px' }}>Premium %</th>
                          <th style={{ textAlign: 'right', padding: '8px' }}>Commercial %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCluster.harvestRecords
                          ?.sort((a, b) => new Date(b.actual_harvest_date) - new Date(a.actual_harvest_date))
                          .map((record, index) => (
                            <tr key={record.id || index} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '8px' }}>
                                {record.actual_harvest_date 
                                  ? new Date(record.actual_harvest_date).toLocaleDateString() 
                                  : 'N/A'}
                              </td>
                              <td style={{ textAlign: 'right', padding: '8px', fontWeight: 600 }}>{record.yield_kg || 0}</td>
                              <td style={{ textAlign: 'right', padding: '8px' }}>{record.fine_pct?.toFixed(1) || '-'}</td>
                              <td style={{ textAlign: 'right', padding: '8px' }}>{record.premium_pct?.toFixed(1) || '-'}</td>
                              <td style={{ textAlign: 'right', padding: '8px' }}>{record.commercial_pct?.toFixed(1) || '-'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
