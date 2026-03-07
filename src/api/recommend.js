/**
 * Recommendation API Client
 * Fetches ML-powered recommendations with offline support
 */

import { supabase } from '../lib/supabase';

const API_BASE = '/api/ml';

/**
 * @typedef {Object} ClusterFeatures
 * @property {number} plant_age_months
 * @property {number} number_of_plants
 * @property {string} fertilizer_type
 * @property {string} fertilizer_frequency
 * @property {string} pesticide_type
 * @property {string} pesticide_frequency
 * @property {number} pruning_interval_months
 * @property {boolean} shade_tree_present
 * @property {number} soil_ph
 * @property {number} avg_temp_c
 * @property {number} avg_rainfall_mm
 * @property {number} avg_humidity_pct
 * @property {number} elevation_m
 * @property {number} previous_yield_per_tree
 * @property {number} previous_quality_score
 * @property {number} yield_trend
 */

/**
 * @typedef {Object} Recommendation
 * @property {string} type
 * @property {string} text
 * @property {number} confidence
 * @property {string} priority
 * @property {Array} factors
 * @property {string} [explanation]
 * @property {string} [id]
 * @property {string} [cluster_id]
 */

/**
 * @typedef {Object} RecommendResponse
 * @property {string} cluster_id
 * @property {Recommendation[]} recommendations
 * @property {string} model_version
 * @property {string} timestamp
 * @property {boolean} fallback_used
 */

/**
 * Fetch ML-powered recommendations for a cluster
 * 
 * @param {string} clusterId - The cluster ID
 * @param {ClusterFeatures} features - Cluster features for ML inference
 * @returns {Promise<RecommendResponse>}
 */
export async function fetchRecommendations(clusterId, features) {
  try {
    const response = await fetch(`${API_BASE}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cluster_id: clusterId,
        features: features,
        include_explanations: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[recommend.js] Failed to fetch recommendations:', error);
    throw error;
  }
}

/**
 * Get cached recommendations from IndexedDB
 * 
 * @param {string} clusterId - The cluster ID
 * @returns {Promise<RecommendResponse|null>}
 */
export async function getCachedRecommendations(clusterId) {
  try {
    const db = await openRecommendationCache();
    const cached = await db.get('recommendations', clusterId);
    
    if (!cached) return null;
    
    // Check if cache is expired (24 hours)
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - cached.timestamp > CACHE_DURATION_MS) {
      await db.delete('recommendations', clusterId);
      return null;
    }
    
    return cached.data;
  } catch (error) {
    console.error('[recommend.js] Failed to get cached recommendations:', error);
    return null;
  }
}

/**
 * Save recommendations to IndexedDB cache
 * 
 * @param {string} clusterId - The cluster ID
 * @param {RecommendResponse} recommendations - The recommendations to cache
 * @returns {Promise<void>}
 */
export async function cacheRecommendations(clusterId, recommendations) {
  try {
    const db = await openRecommendationCache();
    await db.put('recommendations', {
      clusterId,
      data: recommendations,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[recommend.js] Failed to cache recommendations:', error);
  }
}

/**
 * Hybrid fetch: tries API first, falls back to cache
 * 
 * @param {string} clusterId - The cluster ID
 * @param {ClusterFeatures} features - Cluster features for ML inference
 * @returns {Promise<{data: RecommendResponse, source: 'api'|'cache'|'none', isStale?: boolean}>}
 */
export async function fetchRecommendationsHybrid(clusterId, features) {
  // Try online first
  if (navigator.onLine) {
    try {
      const result = await fetchRecommendations(clusterId, features);
      
      // Cache for offline use
      await cacheRecommendations(clusterId, result);
      
      return { 
        data: result, 
        source: 'api',
        isStale: false 
      };
    } catch (error) {
      console.warn('[recommend.js] API failed, trying cache:', error);
    }
  }
  
  // Try cache
  const cached = await getCachedRecommendations(clusterId);
  if (cached) {
    return { 
      data: cached, 
      source: 'cache', 
      isStale: true 
    };
  }
  
  // Return empty recommendations
  return {
    data: {
      cluster_id: clusterId,
      recommendations: [],
      model_version: '1.0.0',
      timestamp: new Date().toISOString(),
      fallback_used: true,
    },
    source: 'none',
    isStale: true,
  };
}

/**
 * Batch fetch recommendations for multiple clusters
 * 
 * @param {Array<{clusterId: string, features: ClusterFeatures}>} clusters - Array of cluster data
 * @returns {Promise<Map<string, RecommendResponse>>}
 */
export async function fetchRecommendationsBatch(clusters) {
  const results = new Map();
  
  // Fetch in parallel with limit
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
    const batch = clusters.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async ({ clusterId, features }) => {
        try {
          const result = await fetchRecommendationsHybrid(clusterId, features);
          results.set(clusterId, result);
        } catch (error) {
          console.error(`[recommend.js] Failed to fetch recommendations for ${clusterId}:`, error);
          results.set(clusterId, {
            data: {
              cluster_id: clusterId,
              recommendations: [],
              model_version: '1.0.0',
              timestamp: new Date().toISOString(),
              fallback_used: true,
            },
            source: 'none',
          });
        }
      })
    );
  }
  
  return results;
}

/**
 * Clear cached recommendations for a cluster
 * 
 * @param {string} clusterId - The cluster ID
 * @returns {Promise<void>}
 */
export async function clearCachedRecommendations(clusterId) {
  try {
    const db = await openRecommendationCache();
    await db.delete('recommendations', clusterId);
  } catch (error) {
    console.error('[recommend.js] Failed to clear cache:', error);
  }
}

/**
 * Clear all cached recommendations
 * 
 * @returns {Promise<void>}
 */
export async function clearAllCachedRecommendations() {
  try {
    const db = await openRecommendationCache();
    await db.clear('recommendations');
  } catch (error) {
    console.error('[recommend.js] Failed to clear all cache:', error);
  }
}

/**
 * Get recommendation cache stats
 * 
 * @returns {Promise<{count: number, oldest: number, newest: number}>}
 */
export async function getRecommendationCacheStats() {
  try {
    const db = await openRecommendationCache();
    const all = await db.getAll('recommendations');
    
    if (all.length === 0) {
      return { count: 0, oldest: 0, newest: 0 };
    }
    
    const timestamps = all.map(r => r.timestamp).sort((a, b) => a - b);
    
    return {
      count: all.length,
      oldest: timestamps[0],
      newest: timestamps[timestamps.length - 1],
    };
  } catch (error) {
    console.error('[recommend.js] Failed to get cache stats:', error);
    return { count: 0, oldest: 0, newest: 0 };
  }
}

// IndexedDB helper
let recommendationCacheDB = null;

async function openRecommendationCache() {
  if (recommendationCacheDB) return recommendationCacheDB;
  
  recommendationCacheDB = await import('idb').then(({ openDB }) => 
    openDB('ikape-rec-cache', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recommendations')) {
          db.createObjectStore('recommendations', { keyPath: 'clusterId' });
        }
      },
    })
  );
  
  return recommendationCacheDB;
}

// Confidence threshold constants
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 50,
  LOW: 0,
};

/**
 * Get confidence level based on score
 * 
 * @param {number} confidence - Confidence score 0-100
 * @returns {'high'|'medium'|'low'}
 */
export function getConfidenceLevel(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Get color config for confidence level
 * 
 * @param {string} level - 'high', 'medium', or 'low'
 * @returns {{bg: string, text: string}}
 */
export function getConfidenceColors(level) {
  const colors = {
    high: { bg: '#dcfce7', text: '#16a34a' },    // green
    medium: { bg: '#fef3c7', text: '#d97706' },  // yellow
    low: { bg: '#fee2e2', text: '#dc2626' },     // red
  };
  return colors[level] || colors.low;
}
