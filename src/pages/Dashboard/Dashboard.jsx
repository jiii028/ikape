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
  Edit,
  Mountain,
  Ruler,
  Eye,
  EyeOff,
} from 'lucide-react'
import ClusterFormModal from '../../components/ClusterFormModal/ClusterFormModal'
import FarmFormModal from '../../components/FarmFormModal/FarmFormModal'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import './Dashboard.css'

const STAGE_CONFIG = {
  'seed-sapling': { label: 'Sapling', icon: Sprout, color: '#86efac', bg: '#f0fdf4' },
  'tree': { label: 'Tree', icon: TreePine, color: '#34d399', bg: '#ecfdf5' },
  'flowering': { label: 'Flowering', icon: Flower2, color: '#fbbf24', bg: '#fffbeb' },
  'ready-to-harvest': { label: 'Ready to Harvest', icon: Coffee, color: '#f87171', bg: '#fef2f2' },
}

const STAGE_OVERVIEW = {
  'seed-sapling': { label: 'Sapling', icon: Sprout },
  'tree': { label: 'Tree', icon: TreePine },
  'flowering': { label: 'Flowering', icon: Flower2 },
  'ready-to-harvest': { label: 'Ready to Harvest', icon: Coffee },
}

export default function Dashboard() {
  const { farm, clusters, deleteCluster } = useFarm()
  const navigate = useNavigate()
  const [showClusterForm, setShowClusterForm] = useState(false)
  const [showFarmForm, setShowFarmForm] = useState(false)
  const [clustersVisible, setClustersVisible] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, clusterId: null, clusterName: '' })

  const farmHasDetails = farm && farm.farm_name && farm.farm_name !== 'My Farm' && farm.farm_area

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
        <div className="dash-header-actions">
          <button className="btn-secondary" onClick={() => setShowFarmForm(true)}>
            <Edit size={16} />
            {farmHasDetails ? 'Edit Farm' : 'Register Farm'}
          </button>
          {farmHasDetails && (
            <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
              <Plus size={18} />
              Add Cluster
            </button>
          )}
        </div>
      </div>

      {/* Farm Info Card */}
      {!farmHasDetails ? (
        <div className="farm-info-prompt">
          <div className="farm-info-prompt-content">
            <Leaf size={40} />
            <h3>Add Farm Details</h3>
            <p>Add your farm details to start managing clusters and harvest records.</p>
            <button className="btn-primary" onClick={() => setShowFarmForm(true)}>
              <Plus size={18} /> Add Farm
            </button>
          </div>
        </div>
      ) : (
        <div className="farm-info-card">
          <div className="farm-info-header">
            <h3 className="farm-title">
              <Leaf size={18} />
              {farm.farm_name}
            </h3>
            <button className="btn-icon" onClick={() => setShowFarmForm(true)} title="Edit Farm">
              <Edit size={16} />
            </button>
          </div>
          <div className="farm-info-details">
            <div className="farm-info-item">
              <Ruler size={14} />
              <span>{farm.farm_area || '—'} hectares</span>
            </div>
            <div className="farm-info-item">
              <Mountain size={14} />
              <span>{farm.elevation || '—'} MASL</span>
            </div>
            <div className="farm-info-item">
              <Coffee size={14} />
              <span>{farm.plant_variety || '—'}</span>
            </div>
            <div className="farm-info-item">
              <TreePine size={14} />
              <span>{farm.overall_tree_count || '—'} trees</span>
            </div>
          </div>
        </div>
      )}

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
      {farmHasDetails && clusters.length === 0 ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <Leaf size={64} />
          </div>
          <h3>No Clusters Yet</h3>
          <p>Add your first cluster to begin tracking.</p>
          <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
            <Plus size={18} />
            Add Cluster
          </button>
        </div>
      ) : (
        <div className="farms-section">
          <div className="section-header-row">
            <h2 className="section-title">
              <Layers size={20} />
              Your Clusters
            </h2>
            <div className="cluster-visibility-toggle" role="group" aria-label="Cluster visibility">
              <button
                type="button"
                className={`cluster-visibility-option ${clustersVisible ? 'is-active' : ''}`}
                onClick={() => setClustersVisible(true)}
                aria-pressed={clustersVisible}
              >
                <Eye size={14} />
                Show
              </button>
              <button
                type="button"
                className={`cluster-visibility-option ${!clustersVisible ? 'is-active' : ''}`}
                onClick={() => setClustersVisible(false)}
                aria-pressed={!clustersVisible}
              >
                <EyeOff size={14} />
                Hide
              </button>
            </div>
          </div>
          {clustersVisible ? (
            <div className="farms-grid">
              {clusters.map((cluster) => {
                const config = STAGE_CONFIG[cluster.plantStage] || STAGE_CONFIG['seed-sapling']
                const StageIcon = config.icon
                return (
                  <div
                    key={cluster.id}
                    className={`farm-card ${cluster._isOffline ? 'farm-card--offline' : ''} ${cluster._pendingSync ? 'farm-card--pending' : ''}`}
                    style={{ borderLeft: `4px solid ${config.color}` }}
                    onClick={() => navigate(`/clusters/${cluster.id}/overview`)}
                  >
                    <div className="farm-card-header">
                      <h3>{cluster.clusterName}</h3>
                      {cluster._isOffline && (
                        <span className="offline-badge" title="Created offline - pending sync">
                          ⏳ Offline
                        </span>
                      )}
                      {cluster._pendingSync && !cluster._isOffline && (
                        <span className="pending-badge" title="Has unsaved changes">
                          ✏️ Pending
                        </span>
                      )}
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
                        <span>{cluster.areaSize} sqm</span>
                      </div>
                      <div className="farm-detail">
                        <Sprout size={14} />
                        <span>{cluster.plantCount} plants</span>
                        {cluster.plantStage === 'flowering' && (
                          <>
                            <span className="farm-detail-separator" aria-hidden="true"></span>
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
          ) : (
            <div className="clusters-hidden-note">
              All clusters are hidden. Use "Show All" to display them again.
            </div>
          )}
        </div>
      )}

      {/* Plant Stage Overview */}
      {clusters.length > 0 && clustersVisible && (
        <div className="stage-overview">
          <h2 className="section-title">
            <BarChart3 size={20} />
            Plant Stage Overview
          </h2>
          <div className="stage-cards">
            {['seed-sapling', 'tree', 'flowering', 'ready-to-harvest'].map((stage) => {
              const count = clusters.filter((c) => c.plantStage === stage).length
              const overview = STAGE_OVERVIEW[stage]
              const StageOverviewIcon = overview.icon
              return (
                <div key={stage} className={`stage-card stage-card--${stage}`}>
                  <span className="stage-icon" aria-hidden="true">
                    <StageOverviewIcon size={24} />
                  </span>
                  <span className="stage-count">{count}</span>
                  <span className="stage-label">{overview.label}</span>
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
      {showFarmForm && (
        <FarmFormModal
          onClose={() => setShowFarmForm(false)}
          editData={farm ? {
            id: farm.id,
            farmName: farm.farm_name || '',
            farmArea: farm.farm_area || '',
            elevation: farm.elevation || '',
            plantVariety: farm.plant_variety || '',
            overallTreeCount: farm.overall_tree_count || '',
          } : null}
        />
      )}
    </div>
  )
}
