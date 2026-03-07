/**
 * Phase 3: Harvest Timing Prediction API Client
 * Fetches harvest timing predictions from the backend
 */

// Try to get API URL from environment
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch harvest timing prediction for a cluster
 * @param {string} clusterId - The cluster ID
 * @param {Object} features - Cluster features for prediction
 * @param {string} [floweringDate] - Optional flowering date (ISO string)
 * @returns {Promise<Object>} Prediction result
 */
export async function fetchHarvestTiming(clusterId, features, floweringDate = null) {
  const url = `${API_BASE}/predict/harvest-timing`;
  
  const payload = {
    cluster_id: clusterId,
    features: {
      plant_age_months: features.plant_age_months || 24,
      number_of_plants: features.number_of_plants || 100,
      soil_ph: features.soil_ph || 6.0,
      avg_temp_c: features.avg_temp_c || 25,
      avg_rainfall_mm: features.avg_rainfall_mm || 150,
      avg_humidity_pct: features.avg_humidity_pct || 65,
      elevation_m: features.elevation_m || 1000,
      shade_tree_present: features.shade_tree_present || false,
      fertilizer_type: features.fertilizer_type || 'none',
      pesticide_type: features.pesticide_type || 'none',
      flowering_date: floweringDate
    }
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Harvest timing fetch error:', error);
    throw error;
  }
}

/**
 * Get harvest timing model status
 * @returns {Promise<Object>} Model status
 */
export async function getHarvestTimingStatus() {
  const url = `${API_BASE}/predict/harvest-timing/status`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Harvest timing status error:', error);
    return { model_available: false, error: error.message };
  }
}

/**
 * Convert cluster data to harvest timing features
 * @param {Object} cluster - Cluster data
 * @returns {Object} Features for prediction
 */
export function clusterToHarvestFeatures(cluster) {
  const sd = cluster.stageData || {};
  
  return {
    plant_age_months: parseFloat(sd.plantAgeMonths) || 24,
    number_of_plants: parseInt(sd.treeCount) || 100,
    soil_ph: parseFloat(sd.soilPh) || 6.0,
    avg_temp_c: parseFloat(sd.monthlyTemperature) || 25,
    avg_rainfall_mm: parseFloat(sd.rainfall) || 150,
    avg_humidity_pct: parseFloat(sd.humidity) || 65,
    elevation_m: parseFloat(sd.elevation) || 1000,
    shade_tree_present: sd.shadeTrees === 'Yes',
    fertilizer_type: sd.fertilizerType || 'none',
    pesticide_type: sd.pesticideType || 'none'
  };
}

/**
 * Format days until harvest for display
 * @param {number} days - Days until harvest
 * @returns {string} Formatted string
 */
export function formatDaysUntilHarvest(days) {
  if (days === undefined || days === null) {
    return 'Unknown';
  }
  
  if (days < 0) {
    return `${Math.abs(days)} days overdue`;
  } else if (days === 0) {
    return 'Ready today!';
  } else if (days === 1) {
    return 'Tomorrow';
  } else if (days <= 7) {
    return `${days} days`;
  } else if (days <= 30) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    if (remainingDays === 0) {
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    }
    return `${weeks}w ${remainingDays}d`;
  } else {
    const months = Math.floor(days / 30);
    return `~${months} month${months > 1 ? 's' : ''}`;
  }
}

/**
 * Get harvest status color
 * @param {string} status - Harvest status
 * @returns {string} Color hex code
 */
export function getHarvestStatusColor(status) {
  const colors = {
    'overdue': '#dc2626',    // red
    'ready': '#22c55e',     // green
    'near': '#f59e0b',      // amber
    'upcoming': '#3b82f6',  // blue
    'future': '#6b7280'      // gray
  };
  
  return colors[status] || colors.future;
}

/**
 * Get harvest status label
 * @param {string} status - Harvest status
 * @returns {string} Human-readable label
 */
export function getHarvestStatusLabel(status) {
  const labels = {
    'overdue': 'Overdue',
    'ready': 'Ready to Harvest',
    'near': 'Harvest Soon',
    'upcoming': 'In Coming Weeks',
    'future': 'Future'
  };
  
  return labels[status] || 'Unknown';
}
