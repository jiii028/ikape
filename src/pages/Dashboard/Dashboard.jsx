import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFarm } from '../../context/FarmContext'
import {
  Plus,
  TreePine,
  Sprout,
  Layers,
  Coffee,
  Flower2,
  TrendingUp,
  Leaf,
  BarChart3,
  Trash2,
  CalendarDays,
} from 'lucide-react'
import ClusterFormModal from '../../components/ClusterFormModal/ClusterFormModal'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import './Dashboard.css'

const STAGE_CONFIG = {
  'seed-sapling': { label: 'Seed/Sapling', icon: Sprout, color: '#86efac', bg: '#f0fdf4' },
  'tree': { label: 'Tree', icon: TreePine, color: '#34d399', bg: '#ecfdf5' },
  'flowering': { label: 'Flowering/Fruit-bearing', icon: Flower2, color: '#fbbf24', bg: '#fffbeb' },
  'ready-to-harvest': { label: 'Ready to Harvest', icon: Coffee, color: '#f87171', bg: '#fef2f2' },
}

export default function Dashboard() {
  const { clusters, deleteCluster } = useFarm()
  const navigate = useNavigate()
  const [showClusterForm, setShowClusterForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, clusterId: null, clusterName: '' })

  const totalTrees = clusters.reduce((sum, c) => sum + (parseInt(c.plantCount) || 0), 0)
  const harvestReady = clusters.filter((c) => c.plantStage === 'ready-to-harvest').length

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  const formatEstimatedDate = (date) =>
    date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dash-date">
            {dayName} <span>({dateStr})</span>
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
          <Plus size={18} />
          Add Cluster
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card--clusters">
          <div className="stat-icon">
            <Layers size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{clusters.length}</span>
            <span className="stat-label">Total Clusters</span>
          </div>
        </div>
        <div className="stat-card stat-card--trees">
          <div className="stat-icon">
            <Sprout size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{totalTrees.toLocaleString()}</span>
            <span className="stat-label">Total Trees</span>
          </div>
        </div>
        <div className="stat-card stat-card--harvest">
          <div className="stat-icon">
            <Coffee size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{harvestReady}</span>
            <span className="stat-label">Ready to Harvest</span>
          </div>
        </div>
        <div className="stat-card stat-card--farms">
          <div className="stat-icon">
            <TrendingUp size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {clusters.filter((c) => c.plantStage === 'flowering').length}
            </span>
            <span className="stat-label">Flowering</span>
          </div>
        </div>
      </div>

      {/* Cluster List or Empty State */}
      {clusters.length === 0 ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <Leaf size={64} />
          </div>
          <h3>No Clusters Added Yet</h3>
          <p>Start by adding your first cluster to manage your plants and track harvests.</p>
          <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
            <Plus size={18} />
            Add Your First Cluster
          </button>
        </div>
      ) : (
        <div className="farms-section">
          <h2 className="section-title">
            <Layers size={20} />
            Your Clusters
          </h2>
          <div className="farms-grid">
            {clusters.map((cluster) => {
              const config = STAGE_CONFIG[cluster.plantStage] || STAGE_CONFIG['seed-sapling']
              const StageIcon = config.icon
              return (
                <div
                  key={cluster.id}
                  className="farm-card"
                  style={{ borderLeft: `4px solid ${config.color}` }}
                  onClick={() => navigate(`/clusters/${cluster.id}/overview`)}
                >
                  <div className="farm-card-header">
                    <h3>{cluster.clusterName}</h3>
                    <button
                      className="tile-action-btn"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm({ 
                          isOpen: true, 
                          clusterId: cluster.id, 
                          clusterName: cluster.clusterName 
                        })
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="farm-card-body">
                    <div className="farm-detail">
                      <StageIcon size={14} style={{ color: config.color }} />
                      <span style={{ color: config.color, fontWeight: 600 }}>{config.label}</span>
                    </div>
                    <div className="farm-detail">
                      <Layers size={14} />
                      <span>{cluster.areaSize} hectares</span>
                    </div>
                    <div className="farm-detail">
                      <Sprout size={14} />
                      <span>{cluster.plantCount} plants</span>
                      {cluster.plantStage === 'flowering' && (
                        <>
                          <span>•</span>
                          <CalendarDays size={14} />
                          <span>Estimated: {formatEstimatedDate(cluster.stageData?.estimatedHarvestDate)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="farm-card-footer">
                    {cluster.plantStage === 'ready-to-harvest' && (
                      <span className="harvest-badge">
                        <TrendingUp size={12} />
                        Harvest Ready
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Plant Stage Overview */}
      {clusters.length > 0 && (
        <div className="stage-overview">
          <h2 className="section-title">
            <BarChart3 size={20} />
            Plant Stage Overview
          </h2>
          <div className="stage-cards">
            {['seed-sapling', 'tree', 'flowering', 'ready-to-harvest'].map((stage) => {
              const count = clusters.filter((c) => c.plantStage === stage).length
              const labels = {
                'seed-sapling': { label: 'Seed / Sapling', emoji: '🌱' },
                'tree': { label: 'Tree', emoji: '🌳' },
                'flowering': { label: 'Flowering / Fruit-bearing', emoji: '🌸' },
                'ready-to-harvest': { label: 'Ready to Harvest', emoji: '☕' },
              }
              return (
                <div key={stage} className={`stage-card stage-card--${stage}`}>
                  <span className="stage-emoji">{labels[stage].emoji}</span>
                  <span className="stage-count">{count}</span>
                  <span className="stage-label">{labels[stage].label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
  
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, clusterId: null, clusterName: '' })}
        onConfirm={() => deleteCluster(deleteConfirm.clusterId)}
        title="Delete Cluster"
        message={`Are you sure you want to delete "${deleteConfirm.clusterName}"? This action cannot be undone and all associated data will be permanently removed.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    
      {showClusterForm && <ClusterFormModal onClose={() => setShowClusterForm(false)} />}
    </div>
  )
}
