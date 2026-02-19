import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFarm } from '../../context/FarmContext'
import {
  ArrowLeft,
  Plus,
  Layers,
  Sprout,
  TreePine,
  Flower2,
  Coffee,
  Trash2,
  Edit,
  CalendarDays,
} from 'lucide-react'
import ClusterFormModal from '../../components/ClusterFormModal/ClusterFormModal'
import ClusterDetailModal from '../../components/ClusterDetailModal/ClusterDetailModal'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import './FarmDetail.css'

const STAGE_CONFIG = {
  'seed-sapling': { label: 'Sapling', icon: Sprout, color: '#86efac', bg: '#f0fdf4' },
  'tree': { label: 'Tree', icon: TreePine, color: '#34d399', bg: '#ecfdf5' },
  'flowering': { label: 'Flowering', icon: Flower2, color: '#fbbf24', bg: '#fffbeb' },
  'ready-to-harvest': { label: 'Ready to Harvest', icon: Coffee, color: '#f87171', bg: '#fef2f2' },
}

export default function FarmDetail() {
  const { farmId } = useParams()
  const navigate = useNavigate()
  const { getFarm, deleteCluster } = useFarm()
  const farm = getFarm(farmId)
  const [showClusterForm, setShowClusterForm] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, clusterId: null, clusterName: '' })
  const formatEstimatedDate = (date) =>
    date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'

  if (!farm) {
    return (
      <div className="farm-detail">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back to Dashboard
        </button>
        <div className="empty-state">
          <h3>Farm not found</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="farm-detail">
      <div className="fd-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="fd-title">
          <h1>{farm.farmName}</h1>
          <p>
            {farm.farmArea} ha · {farm.elevation}m elevation · {farm.plantVariety} · {farm.overallTreeCount} trees
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
          <Plus size={18} /> Add Cluster
        </button>
      </div>

      {/* Farm Layout Visual */}
      <div className="farm-layout">
        <div className="farm-layout-header">
          <h2>
            <Layers size={18} /> Farm Layout
          </h2>
          <span className="cluster-count">{farm.clusters.length} clusters</span>
        </div>

        {farm.clusters.length === 0 ? (
          <div className="farm-layout-empty">
            <p>No clusters yet. Add clusters to visualize your farm layout.</p>
            <button className="btn-primary" onClick={() => setShowClusterForm(true)}>
              <Plus size={16} /> Add First Cluster
            </button>
          </div>
        ) : (
          <div className="farm-grid">
            {farm.clusters.map((cluster) => {
              const config = STAGE_CONFIG[cluster.plantStage] || STAGE_CONFIG['seed-sapling']
              const StageIcon = config.icon
              return (
                <div
                  key={cluster.id}
                  className="cluster-tile"
                  style={{ borderColor: config.color, backgroundColor: config.bg }}
                  onClick={() => setSelectedCluster(cluster)}
                >
                  <div className="cluster-tile-top">
                    <StageIcon size={20} style={{ color: config.color }} />
                    <div className="cluster-tile-actions">
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
                  </div>
                  <h4>{cluster.clusterName}</h4>
                  <span className="cluster-stage-label" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  <div className="cluster-tile-info">
                    <span>{cluster.areaSize} ha</span>
                    <span>
                      {cluster.plantCount} plants
                      {cluster.plantStage === 'flowering' && (
                        <>
                          {' '}• <CalendarDays size={12} style={{ verticalAlign: 'text-bottom' }} /> Estimated:{' '}
                          {formatEstimatedDate(cluster.stageData?.estimatedHarvestDate)}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Stage Legend */}
      <div className="stage-legend">
        {Object.entries(STAGE_CONFIG).map(([key, config]) => (
          <div key={key} className="legend-item">
            <span className="legend-dot" style={{ background: config.color }} />
            <span>{config.label}</span>
          </div>
        ))}
      </div>

      {showClusterForm && (
        <ClusterFormModal farmId={farmId} onClose={() => setShowClusterForm(false)} />
      )}

      {selectedCluster && (
        <ClusterDetailModal
          farmId={farmId}
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
        />
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
    </div>
  )
}
