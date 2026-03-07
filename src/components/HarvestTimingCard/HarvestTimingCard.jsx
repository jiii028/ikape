/**
 * Phase 3: Harvest Timing Card Component
 * Displays ML-powered harvest timing prediction for a cluster
 */

import { useEffect, useState } from 'react';
import { 
  Calendar, 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Wheat,
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  fetchHarvestTiming, 
  clusterToHarvestFeatures,
  formatDaysUntilHarvest,
  getHarvestStatusColor,
  getHarvestStatusLabel
} from '../../api/harvestTiming';

const STORAGE_KEY = 'harvest_timing_cache_';

export default function HarvestTimingCard({ cluster }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Get flowering date from cluster data if available
  const floweringDate = cluster?.stageData?.floweringDate || null;

  useEffect(() => {
    if (!cluster?.id) return;
    
    // Check cache first
    const cached = getCachedPrediction(cluster.id);
    if (cached && !isCacheExpired(cached.timestamp)) {
      setPrediction(cached.data);
      setLastUpdated(cached.timestamp);
      setLoading(false);
      
      // Still refresh in background
      fetchPrediction(true);
    } else {
      fetchPrediction();
    }
  }, [cluster?.id, floweringDate]);

  const fetchPrediction = async (isBackground = false) => {
    if (!cluster) return;
    
    if (!isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      const features = clusterToHarvestFeatures(cluster);
      const result = await fetchHarvestTiming(cluster.id, features, floweringDate);
      
      setPrediction(result);
      setLastUpdated(new Date().toISOString());
      
      // Cache the result
      cachePrediction(cluster.id, result);
    } catch (err) {
      console.error('Harvest timing error:', err);
      if (!isBackground) {
        setError(err.message || 'Failed to get prediction');
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  };

  const cachePrediction = (clusterId, data) => {
    try {
      const cacheData = {
        data,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY + clusterId, JSON.stringify(cacheData));
    } catch (e) {
      console.warn('Failed to cache prediction:', e);
    }
  };

  const getCachedPrediction = (clusterId) => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY + clusterId);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  };

  const isCacheExpired = (timestamp) => {
    const cacheAge = Date.now() - new Date(timestamp).getTime();
    return cacheAge > 24 * 60 * 60 * 1000; // 24 hours
  };

  // Render loading state
  if (loading && !prediction) {
    return (
      <div className="harvest-timing-card harvest-timing-card--loading">
        <div className="harvest-timing-loading">
          <RefreshCw size={20} className="spin" />
          <span>Analyzing harvest timing...</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !prediction) {
    return (
      <div className="harvest-timing-card harvest-timing-card--error">
        <AlertCircle size={18} />
        <span>Unable to predict harvest timing</span>
        <button onClick={() => fetchPrediction()}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!prediction) return null;

  const { 
    predicted_days, 
    confidence_interval,
    harvest_optimal_date,
    harvest_window_start,
    harvest_window_end,
    days_until_harvest,
    harvest_status,
    flowering_date_provided,
    is_model_based
  } = prediction;

  const statusColor = getHarvestStatusColor(harvest_status);
  const statusLabel = getHarvestStatusLabel(harvest_status);

  return (
    <div className="harvest-timing-card">
      {/* Header */}
      <div className="harvest-timing-header">
        <div className="harvest-timing-title">
          <Wheat size={20} />
          <h3>Harvest Timing</h3>
        </div>
        <button 
          className="harvest-timing-refresh"
          onClick={() => fetchPrediction()}
          title="Refresh prediction"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Main Countdown */}
      {harvest_optimal_date && (
        <div className="harvest-timing-countdown">
          <div className="countdown-label">Days Until Harvest</div>
          <div 
            className="countdown-value"
            style={{ color: statusColor }}
          >
            {formatDaysUntilHarvest(days_until_harvest)}
          </div>
          <div 
            className="countdown-status"
            style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
          >
            {statusLabel}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="harvest-timing-dates">
        {harvest_optimal_date && (
          <div className="harvest-date-item harvest-date-item--optimal">
            <Calendar size={14} />
            <div>
              <span className="date-label">Optimal Date</span>
              <span className="date-value">{harvest_optimal_date}</span>
            </div>
          </div>
        )}
        
        {harvest_window_start && harvest_window_end && (
          <div className="harvest-date-item">
            <Clock size={14} />
            <div>
              <span className="date-label">Harvest Window</span>
              <span className="date-value">
                {harvest_window_start} — {harvest_window_end}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Prediction Details */}
      <div className="harvest-timing-details">
        <div className="detail-row">
          <span>Predicted Days</span>
          <span className="detail-value">{predicted_days} days</span>
        </div>
        <div className="detail-row">
          <span>Confidence</span>
          <span className="detail-value">{confidence_interval}</span>
        </div>
        
        {!harvest_optimal_date && flowering_date_provided === false && (
          <div className="harvest-timing-tip">
            <Info size={14} />
            <span>Add flowering date to see harvest predictions</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="harvest-timing-footer">
        {is_model_based ? (
          <span className="model-badge model-badge--ml">ML Predicted</span>
        ) : (
          <span className="model-badge model-badge--rule">Rule-based</span>
        )}
        
        {lastUpdated && (
          <span className="last-updated">
            Updated {formatRelativeTime(lastUpdated)}
          </span>
        )}
      </div>
    </div>
  );
}

// Helper function to format relative time
function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
