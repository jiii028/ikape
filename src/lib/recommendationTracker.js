/**
 * Recommendation Action Tracker
 * Tracks user actions on ML-generated recommendations for continuous learning
 * Supports offline mode - queues actions for sync when online
 */

import { supabase } from './supabase';
import { saveOfflineRecord } from './syncManager';

/**
 * @typedef {Object} RecommendationAction
 * @property {string} recommendation_id
 * @property {string} cluster_id
 * @property {string} recommendation_type
 * @property {string} recommendation_text
 * @property {string} [ml_model_version]
 * @property {number} [ml_confidence_score]
 * @property {'accepted' | 'rejected' | 'modified'} user_action
 * @property {string} [action_notes]
 */

/**
 * @typedef {Object} OutcomeRecord
 * @property {string} recommendationId
 * @property {string} actual_outcome - 'yield_improved', 'no_change', 'yield_declined', 'crop_damage'
 * @property {number} yield_change - kg change from previous harvest
 * @property {number} yield_change_pct - percentage change
 */

/**
 * Log user action on a recommendation
 * Works offline - queues for sync if needed
 * 
 * @param {RecommendationAction} action - The recommendation action to log
 * @param {Object} options - Options object
 * @param {boolean} [options.offline] - Force offline mode
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logRecommendationAction(action, options = {}) {
  const offline = options.offline ?? !navigator.onLine;
  
  const record = {
    recommendation_id: action.recommendation_id,
    cluster_id: action.cluster_id,
    recommendation_type: action.recommendation_type,
    recommendation_text: action.recommendation_text,
    ml_model_version: action.ml_model_version || null,
    ml_confidence_score: action.ml_confidence_score || null,
    user_action: action.user_action,
    action_timestamp: new Date().toISOString(),
    action_notes: action.action_notes || null,
    outcome_recorded: false,
  };

  if (offline) {
    // Queue for later sync using syncManager
    await saveOfflineRecord('recommendation_outcomes', {
      ...record,
      id: crypto.randomUUID(),
    }, 'insert');
    
    console.log('[RecommendationTracker] Action queued for offline sync:', action.user_action);
    return { success: true, offline: true };
  }

  try {
    const { error } = await supabase
      .from('recommendation_outcomes')
      .insert(record);

    if (error) throw error;
    
    console.log('[RecommendationTracker] Action logged successfully:', action.user_action);
    return { success: true, offline: false };
  } catch (err) {
    console.error('[RecommendationTracker] Failed to log action:', err);
    return { success: false, error: err.message, offline: false };
  }
}

/**
 * Record outcome after harvest (yield change)
 * Call this after harvest is recorded to track recommendation effectiveness
 * 
 * @param {OutcomeRecord} outcome - The outcome data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function recordRecommendationOutcome(outcome) {
  const offline = !navigator.onLine;
  
  const updateData = {
    outcome_recorded: true,
    actual_outcome: outcome.actual_outcome,
    yield_change: outcome.yield_change,
    yield_change_pct: outcome.yield_change_pct,
    recorded_at: new Date().toISOString(),
  };

  if (offline) {
    // Store in localStorage for later sync
    const pendingOutcomes = JSON.parse(localStorage.getItem('pending_outcomes') || '[]');
    pendingOutcomes.push({
      recommendationId: outcome.recommendationId,
      ...updateData,
      timestamp: Date.now(),
    });
    localStorage.setItem('pending_outcomes', JSON.stringify(pendingOutcomes));
    
    console.log('[RecommendationTracker] Outcome queued for offline sync');
    return { success: true, offline: true };
  }

  try {
    const { error } = await supabase
      .from('recommendation_outcomes')
      .update(updateData)
      .eq('id', outcome.recommendationId);

    if (error) throw error;
    
    console.log('[RecommendationTracker] Outcome recorded successfully');
    return { success: true, offline: false };
  } catch (err) {
    console.error('[RecommendationTracker] Failed to record outcome:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Process any pending outcomes stored locally
 * Call this when the app goes online
 */
export async function processPendingOutcomes() {
  if (!navigator.onLine) return;
  
  const pendingOutcomes = JSON.parse(localStorage.getItem('pending_outcomes') || '[]');
  if (pendingOutcomes.length === 0) return;
  
  console.log(`[RecommendationTracker] Processing ${pendingOutcomes.length} pending outcomes`);
  
  const remainingOutcomes = [];
  
  for (const outcome of pendingOutcomes) {
    try {
      const { error } = await supabase
        .from('recommendation_outcomes')
        .update({
          outcome_recorded: true,
          actual_outcome: outcome.actual_outcome,
          yield_change: outcome.yield_change,
          yield_change_pct: outcome.yield_change_pct,
          recorded_at: new Date(outcome.timestamp).toISOString(),
        })
        .eq('id', outcome.recommendationId);

      if (error) throw error;
    } catch (err) {
      console.error('[RecommendationTracker] Failed to sync outcome:', err);
      remainingOutcomes.push(outcome);
    }
  }
  
  localStorage.setItem('pending_outcomes', JSON.stringify(remainingOutcomes));
  console.log(`[RecommendationTracker] Synced ${pendingOutcomes.length - remainingOutcomes.length} outcomes`);
}

/**
 * Get recommendation outcomes for a cluster
 * 
 * @param {string} clusterId - The cluster ID
 * @returns {Promise<Array>}
 */
export async function getClusterRecommendationOutcomes(clusterId) {
  try {
    const { data, error } = await supabase
      .from('recommendation_outcomes')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[RecommendationTracker] Failed to fetch outcomes:', err);
    return [];
  }
}

/**
 * Get effectiveness statistics for a cluster
 * 
 * @param {string} clusterId - The cluster ID
 * @returns {Promise<{accepted: number, rejected: number, pending: number, avgConfidence: number}>}
 */
export async function getClusterRecommendationStats(clusterId) {
  const outcomes = await getClusterRecommendationOutcomes(clusterId);
  
  if (outcomes.length === 0) {
    return {
      accepted: 0,
      rejected: 0,
      pending: 0,
      modified: 0,
      avgConfidence: 0,
      improvementRate: 0,
    };
  }
  
  const stats = {
    accepted: outcomes.filter(o => o.user_action === 'accepted').length,
    rejected: outcomes.filter(o => o.user_action === 'rejected').length,
    modified: outcomes.filter(o => o.user_action === 'modified').length,
    pending: outcomes.filter(o => o.user_action === 'pending').length,
    avgConfidence: 0,
    improvementRate: 0,
  };
  
  // Calculate average confidence
  const withConfidence = outcomes.filter(o => o.ml_confidence_score != null);
  if (withConfidence.length > 0) {
    stats.avgConfidence = withConfidence.reduce((sum, o) => sum + o.ml_confidence_score, 0) / withConfidence.length;
  }
  
  // Calculate improvement rate (for completed outcomes)
  const withOutcome = outcomes.filter(o => o.outcome_recorded && o.yield_change != null);
  if (withOutcome.length > 0) {
    const improved = withOutcome.filter(o => o.yield_change > 0).length;
    stats.improvementRate = (improved / withOutcome.length) * 100;
  }
  
  return stats;
}

/**
 * Check if ML recommendations are enabled
 * Reads from localStorage, defaults to true
 * 
 * @returns {boolean}
 */
export function isMLRecommendationsEnabled() {
  try {
    return localStorage.getItem('ml_recommendations_enabled') !== 'false';
  } catch {
    return true;
  }
}

/**
 * Toggle ML recommendations on/off
 * 
 * @param {boolean} enabled - Whether to enable ML recommendations
 */
export function setMLRecommendationsEnabled(enabled) {
  try {
    localStorage.setItem('ml_recommendations_enabled', String(enabled));
  } catch (err) {
    console.error('[RecommendationTracker] Failed to save preference:', err);
  }
}

/**
 * Extract features from a cluster for ML inference
 * 
 * @param {Object} cluster - The cluster object from FarmContext
 * @returns {Object} Features object for ML model
 */
export function extractClusterFeatures(cluster) {
  const sd = cluster.stageData || {};
  
  return {
    plant_age_months: sd.plantAgeMonths || 0,
    number_of_plants: cluster.plantCount || 0,
    fertilizer_type: sd.fertilizerType || 'none',
    fertilizer_frequency: sd.fertilizerFrequency || 'never',
    pesticide_type: sd.pesticideType || 'none',
    pesticide_frequency: sd.pesticideFrequency || 'never',
    pruning_interval_months: sd.pruningIntervalMonths || 0,
    shade_tree_present: sd.shadeTrees === 'Yes',
    soil_ph: parseFloat(sd.soilPh) || 6.0,
    avg_temp_c: parseFloat(sd.monthlyTemperature) || 24.0,
    avg_rainfall_mm: parseFloat(sd.rainfall) || 150.0,
    avg_humidity_pct: parseFloat(sd.humidity) || 70.0,
    elevation_m: cluster.farmElevation || 1000,
    previous_yield_per_tree: parseFloat(sd.previousYield) || 0,
    previous_quality_score: parseFloat(sd.previousQualityScore) || 50,
    yield_trend: sd.yieldTrend || 0,
  };
}

// Export constants for recommendation types
export const RECOMMENDATION_TYPES = {
  FERTILIZER: 'fertilizer',
  PESTICIDE: 'pesticide',
  PRUNING: 'pruning',
  SHADE: 'shade',
  IRRIGATION: 'irrigation',
  SOIL_AMENDMENT: 'soil_amendment',
};

export const USER_ACTIONS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  MODIFIED: 'modified',
};

export const OUTCOMES = {
  YIELD_IMPROVED: 'yield_improved',
  NO_CHANGE: 'no_change',
  YIELD_DECLINED: 'yield_declined',
  CROP_DAMAGE: 'crop_damage',
};

// Alias for backwards compatibility
export const trackRecommendationAction = logRecommendationAction;
