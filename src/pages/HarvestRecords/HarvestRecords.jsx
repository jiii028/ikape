import { useState } from 'react'
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
} from 'recharts'
import './HarvestRecords.css'

const GRADE_COLORS = ['#2d5a2d', '#7bc67b', '#fbbf24']

export default function HarvestRecords() {
  const { getAllClusters } = useFarm()
  const [seasonFilter, setSeasonFilter] = useState('')
  const [selectedCluster, setSelectedCluster] = useState(null)

  // Get clusters that are ready-to-harvest, flowering, or fruit-bearing
  const allClusters = getAllClusters()
  const harvestClusters = allClusters.filter((c) =>
    ['ready-to-harvest', 'flowering', 'fruit-bearing'].includes(c.plantStage)
  )

  const filteredClusters = seasonFilter
    ? harvestClusters.filter((c) => c.stageData?.harvestSeason?.includes(seasonFilter))
    : harvestClusters

  // Get unique seasons
  const seasons = [...new Set(allClusters.map((c) => c.stageData?.harvestSeason).filter(Boolean))]

  // Generate chart data from selected cluster
  const getYieldChartData = (cluster) => {
    if (!cluster?.stageData) return []
    return [
      { name: 'Previous', yield: parseFloat(cluster.stageData.previousYield) || 0 },
      { name: 'Predicted', yield: parseFloat(cluster.stageData.predictedYield) || 0 },
      { name: 'Actual', yield: parseFloat(cluster.stageData.currentYield) || 0 },
    ]
  }

  const getGradeData = (cluster) => {
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
  }

  return (
    <div className="harvest-page">
      <div className="harvest-header">
        <div>
          <h1>Harvest Records & Forecast</h1>
          <p>Monitor historical performance and future yield predictions</p>
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
            <ChevronDown size={14} />
          </div>
        </div>
      </div>

      {/* Cluster List */}
      <div className="harvest-content">
        <div className="cluster-list-panel">
          <h3>Active Clusters ({filteredClusters.length})</h3>
          {filteredClusters.length === 0 ? (
            <div className="cluster-list-empty">
              <p>No harvest-ready or flowering clusters found.</p>
            </div>
          ) : (
            <div className="cluster-list">
              {filteredClusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className={`cluster-list-item ${selectedCluster?.id === cluster.id ? 'active' : ''}`}
                  onClick={() => setSelectedCluster(cluster)}
                >
                  <div className="cli-top">
                    <span className="cli-name">{cluster.clusterName}</span>
                    <span className={`cli-stage cli-stage--${cluster.plantStage}`}>
                      {stageLabels[cluster.plantStage] || cluster.plantStage}
                    </span>
                  </div>
                  <div className="cli-details">
                    <span><Coffee size={12} /> {cluster.stageData?.variety || 'N/A'}</span>
                    <span><Layers size={12} /> {cluster.plantCount} trees</span>
                    <span><Calendar size={12} /> {cluster.stageData?.harvestSeason || 'N/A'}</span>
                  </div>
                  <div className="cli-yield">
                    <span>Predicted: {cluster.stageData?.predictedYield || '—'} kg</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cluster Detail / Overlay Panel */}
        <div className="cluster-detail-panel">
          {!selectedCluster ? (
            <div className="detail-empty">
              <BarChart3 size={48} />
              <h3>Select a Cluster</h3>
              <p>Click a cluster from the list to view detailed records and forecasts</p>
            </div>
          ) : (
            <div className="detail-content">
              <div className="detail-header">
                <h3>{selectedCluster.clusterName}</h3>
                <button className="modal-close" onClick={() => setSelectedCluster(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Cluster Info */}
              <div className="detail-section">
                <h4>Cluster Information</h4>
                <div className="detail-info-grid">
                  <div className="info-item">
                    <span className="info-label">Cluster ID</span>
                    <span className="info-value">{selectedCluster.id.slice(-6)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Tree Count</span>
                    <span className="info-value">{selectedCluster.plantCount}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Variety</span>
                    <span className="info-value">{selectedCluster.stageData?.variety || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Date Planted</span>
                    <span className="info-value">{selectedCluster.stageData?.datePlanted || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Fertilizer</span>
                    <span className="info-value">{selectedCluster.stageData?.fertilizerType || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Soil pH</span>
                    <span className="info-value">{selectedCluster.stageData?.soilPh || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Shade Trees</span>
                    <span className="info-value">{selectedCluster.stageData?.shadeTrees || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Season</span>
                    <span className="info-value">{selectedCluster.stageData?.harvestSeason || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Yield & Forecast Data */}
              <div className="detail-section">
                <h4>
                  <TrendingUp size={16} /> Yield & Forecast
                </h4>
                <div className="yield-summary">
                  <div className="yield-card">
                    <span className="yield-label">Previous Yield</span>
                    <span className="yield-value">{selectedCluster.stageData?.previousYield || '0'} kg</span>
                  </div>
                  <div className="yield-card yield-card--predicted">
                    <span className="yield-label">Predicted Yield</span>
                    <span className="yield-value">{selectedCluster.stageData?.predictedYield || '0'} kg</span>
                  </div>
                  <div className="yield-card yield-card--actual">
                    <span className="yield-label">Actual Yield</span>
                    <span className="yield-value">{selectedCluster.stageData?.currentYield || '0'} kg</span>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="detail-section">
                <h4>Analytics & Forecast Charts</h4>
                <div className="charts-grid">
                  <div className="chart-card">
                    <h5>Yield Comparison (Predicted vs Actual)</h5>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={getYieldChartData(selectedCluster)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="yield" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h5>Grade Distribution</h5>
                    {getGradeData(selectedCluster).length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={getGradeData(selectedCluster)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                          >
                            {getGradeData(selectedCluster).map((entry, index) => (
                              <Cell key={entry.name} fill={GRADE_COLORS[index % GRADE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chart-empty">No grade data available</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
