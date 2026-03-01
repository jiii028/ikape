import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { getCached, setCached, clearCachedByPrefix } from '../lib/queryCache'
import {
  getCachedData,
  refreshLocalCache,
  saveOfflineRecord,
  saveOptimisticData,
  removePendingOperationsForRecord
} from '../lib/syncManager'

// Optimized data fetching functions
const fetchFarmDataOptimized = async (authUser) => {
  try {
    // First, fetch the farm for this user
    const { data: farm, error: farmError } = await supabase
      .from('farms')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (farmError) {
      throw new Error('Failed to fetch farm data: ' + farmError.message)
    }

    // If no farm exists, return early
    if (!farm) {
      return { farm: null, clusters: [] }
    }

    // Fetch clusters for this farm
    const { data: clusters, error: clustersError } = await supabase
      .from('clusters')
      .select('*')
      .eq('farm_id', farm.id)
      .order('created_at', { ascending: true })

    if (clustersError) {
      throw new Error('Failed to fetch clusters: ' + clustersError.message)
    }

    const clusterIds = (clusters || []).map(c => c.id)
    let stageData = []
    let harvestRecords = []
    let lifecycleEvents = []

    // Fetch related data only if we have clusters
    if (clusterIds.length > 0) {
      // Fetch all related data in parallel
      const [stageDataResult, harvestResult, lifecycleResult] = await Promise.all([
        supabase
          .from('cluster_agronomic_config')
          .select('*')
          .in('cluster_id', clusterIds),
        supabase
          .from('harvest_records')
          .select('*')
          .in('cluster_id', clusterIds),
        supabase
          .from('cluster_lifecycle_events')
          .select('*')
          .in('cluster_id', clusterIds)
          .order('actual_date', { ascending: false })
      ])

      if (stageDataResult.error) {
        console.warn('Failed to fetch agronomic config:', stageDataResult.error.message)
      }
      if (harvestResult.error) {
        console.warn('Failed to fetch harvest records:', harvestResult.error.message)
      }
      if (lifecycleResult.error) {
        console.warn('Failed to fetch lifecycle events:', lifecycleResult.error.message)
      }

      stageData = stageDataResult.data || []
      harvestRecords = harvestResult.data || []
      lifecycleEvents = lifecycleResult.data || []
    }

    // Database to frontend stage mapping
    // Database enum: seed-sapling, vegetative, flowering, fruiting, harvest-ready, post-harvest, dormant
    const dbToFrontendStageMapping = {
      'seed-sapling': 'seed-sapling',
      'vegetative': 'tree',
      'flowering': 'flowering',
      'fruiting': 'ready-to-harvest', // Map fruiting to ready-to-harvest
      'harvest-ready': 'ready-to-harvest',
      'post-harvest': 'ready-to-harvest', // Post-harvest clusters are still harvest-ready
      'dormant': 'seed-sapling' // Dormant clusters treated as new/seed-sapling
    }

    // Process and normalize data - map database fields to frontend fields
    const normalizedClusters = (clusters || []).map(cluster => {
      const clusterStageData = stageData.find(sd => sd.cluster_id === cluster.id) || {}
      const clusterHarvest = harvestRecords.filter(hr => hr.cluster_id === cluster.id)
      
      // Get the latest lifecycle event for this cluster
      const latestLifecycleEvent = lifecycleEvents.find(le => le.cluster_id === cluster.id)
      const currentStage = latestLifecycleEvent ?
        (dbToFrontendStageMapping[latestLifecycleEvent.stage] || latestLifecycleEvent.stage) :
        'seed-sapling' // Default stage
      
      // Use mapClusterFromDb for proper field name mapping
      const mappedCluster = mapClusterFromDb(cluster, clusterStageData)
      
      // Add derived fields
      return {
        ...mappedCluster,
        harvestRecords: clusterHarvest,
        plantStage: currentStage
      }
    })

    return { farm, clusters: normalizedClusters }
  } catch (error) {
    console.error('Optimized fetchFarmData error:', error)
    throw error
  }
}

const FarmContext = createContext(null)
const FARM_CACHE_TTL_MS = 5 * 60 * 1000

function farmCacheKey(userId) {
  return `farm_context:${userId}`
}

export function FarmProvider({ children }) {
  const { authUser } = useAuth()
  const [farm, setFarm] = useState(null)
  const [clusters, setClusters] = useState([])
  const [loading, setLoading] = useState(false)
  const currentCacheKey = authUser?.id ? farmCacheKey(authUser.id) : null
  
  // Track processing cluster IDs to prevent duplicate submissions
  const processingClusters = useRef(new Set())

  const persistFarmSnapshot = useCallback(
    (nextFarm, nextClusters) => {
      if (!currentCacheKey) return
      setCached(currentCacheKey, {
        farm: nextFarm || null,
        clusters: Array.isArray(nextClusters) ? nextClusters : [],
      })
    },
    [currentCacheKey]
  )

  const fetchFarmData = useCallback(async (forceRefresh = false) => {
    if (!authUser) {
      clearCachedByPrefix('farm_context:')
      setFarm(null)
      setClusters([])
      setLoading(false)
      return
    }

    const cacheKey = farmCacheKey(authUser.id)
    
    // Only use cache if not forcing refresh
    if (!forceRefresh) {
      const cachedSnapshot = getCached(cacheKey, FARM_CACHE_TTL_MS)
      if (cachedSnapshot?.farm) {
        setFarm(cachedSnapshot.farm)
        setClusters(Array.isArray(cachedSnapshot.clusters) ? cachedSnapshot.clusters : [])
        setLoading(false)
        return
      }
    }

    setLoading(true)

    if (!navigator.onLine) {
      try {
        const cachedFarms = await getCachedData('farms')
        if (cachedFarms && cachedFarms.length > 0) {
          const offlineFarm = cachedFarms[0]
          setFarm(offlineFarm)
          setClusters(offlineFarm.clusters || [])
        }
      } catch (err) {
        console.error('Failed to load offline farm data:', err)
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const { farm, clusters } = await fetchFarmDataOptimized(authUser)
      
      if (farm) {
        setFarm(farm)
        setClusters(clusters)
        persistFarmSnapshot(farm, clusters)
      } else {
        // Create new farm if none exists
        const { data: newFarm, error: createErr } = await supabase
          .from('farms')
          .insert({ user_id: authUser.id, farm_name: 'My Farm' })
          .select()
          .single()

        if (createErr) {
          console.error('Error creating farm:', createErr.message)
        } else {
          const normalizedFarm = mapFarmFromDb(newFarm)
          setFarm(normalizedFarm)
          persistFarmSnapshot(normalizedFarm, [])
        }
        setClusters([])
      }
      
      // Refresh local cache for offline use
      if (navigator.onLine && authUser?.id) {
        refreshLocalCache(authUser.id);
      }
    } catch (err) {
      console.error('fetchFarmData error:', err)
    } finally {
      setLoading(false)
    }
  }, [authUser, persistFarmSnapshot])

  useEffect(() => {
    fetchFarmData()
  }, [fetchFarmData])

  const setFarmInfo = async (farmData) => {
    const toNumber = (value) => {
      if (value === '' || value === null || value === undefined) return null
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    const toInteger = (value) => {
      if (value === '' || value === null || value === undefined) return null
      const parsed = Number.parseInt(value, 10)
      return Number.isInteger(parsed) ? parsed : null
    }

    // If farm doesn't exist, create it
    if (!farm?.id) {
      if (!authUser?.id) {
        return { success: false, error: 'You must be logged in to register a farm.' }
      }

      const { data: newFarm, error: createError } = await supabase
        .from('farms')
        .insert({
          user_id: authUser.id,
          farm_name: farmData.farmName || 'My Farm',
          farm_area: toNumber(farmData.farmArea),
          elevation_m: toNumber(farmData.elevation),
          plant_variety: farmData.plantVariety || null,
          overall_tree_count: toInteger(farmData.overallTreeCount),
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating farm:', createError.message)
        return { success: false, error: normalizeDbError(createError, 'Unable to create farm.') }
      }

      const normalizedFarm = mapFarmFromDb(newFarm)
      setFarm(normalizedFarm)
      persistFarmSnapshot(normalizedFarm, clusters)
      return { success: true, farm: normalizedFarm }
    }

    // Farm exists, update it
    const { data, error } = await supabase
      .from('farms')
      .update({
        farm_name: farmData.farmName || null,
        farm_area: toNumber(farmData.farmArea),
        elevation_m: toNumber(farmData.elevation),
        plant_variety: farmData.plantVariety || null,
        overall_tree_count: toInteger(farmData.overallTreeCount),
      })
      .eq('id', farm.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating farm info:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to save farm details.') }
    }

    const normalizedFarm = mapFarmFromDb(data)
    setFarm(normalizedFarm)
    persistFarmSnapshot(normalizedFarm, clusters)
    return { success: true, farm: normalizedFarm }
  }

  const addCluster = async (cluster) => {
    if (!farm?.id) {
      return { success: false, error: 'Farm record is not available yet. Please refresh and try again.' }
    }

    const areaSize = Number.parseFloat(cluster.areaSize)
    const plantCount = Number.parseInt(cluster.plantCount, 10)
    
    // Stronger deduplication: use cluster name + plant stage as dedup key
    const dedupKey = `cluster:${cluster.clusterName}:${cluster.plantStage}`
    if (processingClusters.current.has(dedupKey)) {
      console.log('[addCluster] Already processing cluster with same name/stage, skipping:', dedupKey)
      return { success: false, error: 'Cluster is already being processed.' }
    }
    processingClusters.current.add(dedupKey)
    
    const clientId = crypto.randomUUID() // Generate client-side ID
    console.log('[addCluster] Generated clientId:', clientId, 'dedupKey:', dedupKey)

    const clusterData = {
      id: clientId,
      farm_id: farm.id,
      cluster_name: cluster.clusterName,
      area_size_sqm: Number.isFinite(areaSize) ? areaSize : null,
      plant_count: Number.isInteger(plantCount) ? plantCount : null,
      variety: cluster.variety || null,
      created_at: new Date().toISOString(),
    }

    // Map frontend stage to database stage
    // Database enum: seed-sapling, vegetative, flowering, fruiting, harvest-ready, post-harvest, dormant
    const stageMapping = {
      'seed-sapling': 'seed-sapling',
      'tree': 'vegetative',
      'flowering': 'flowering',
      'ready-to-harvest': 'harvest-ready'
    }

    // OFFLINE MODE: Save to sync queue and optimistic cache
    if (!navigator.onLine) {
      try {
        // Save cluster to pending sync
        await saveOfflineRecord('clusters', clusterData, 'insert')
        
        // If plant stage provided, save lifecycle event too
        if (cluster.plantStage) {
          const lifecycleData = {
            id: crypto.randomUUID(),
            cluster_id: clientId,
            stage: stageMapping[cluster.plantStage] || cluster.plantStage,
            actual_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          }
          await saveOfflineRecord('cluster_lifecycle_events', lifecycleData, 'insert')
        }
        
        // Save to optimistic cache for immediate UI display
        const optimisticCluster = {
          ...clusterData,
          clusterName: cluster.clusterName,
          areaSize: cluster.areaSize,
          plantCount: cluster.plantCount,
          variety: cluster.variety,
          plantStage: cluster.plantStage || 'seed-sapling',
          stageData: {},
          harvestRecords: [],
          _isOffline: true,
          _pendingSync: true,
        }
        await saveOptimisticData('clusters', optimisticCluster)

        // Update local state immediately (optimistic UI)
        const next = [...clusters, optimisticCluster]
        setClusters(next)
        persistFarmSnapshot(farm, next)

        // Clean up dedup key
        processingClusters.current.delete(dedupKey)
        
        return {
          success: true,
          offline: true,
          cluster: optimisticCluster,
          message: 'Cluster saved offline. Will sync when connection is restored.'
        }
      } catch (err) {
        console.error('Failed to save cluster offline:', err)
        // Clean up dedup key even on error
        processingClusters.current.delete(dedupKey)
        return { success: false, error: 'Failed to save cluster offline.' }
      }
    }

    // ONLINE MODE: Direct Supabase insert
    try {
      const { data, error } = await supabase
        .from('clusters')
        .insert(clusterData)
        .select()
        .single()

      if (error) throw error

      // If plant stage was provided, create a lifecycle event
      if (cluster.plantStage && data?.id) {
        const dbStage = stageMapping[cluster.plantStage] || cluster.plantStage
        
        const { error: lifecycleError } = await supabase
          .from('cluster_lifecycle_events')
          .insert({
            cluster_id: data.id,
            stage: dbStage,
            actual_date: new Date().toISOString().split('T')[0],
          })
        
        if (lifecycleError) {
          console.error('Error creating lifecycle event:', lifecycleError.message)
        }
      }

      const newCluster = mapClusterFromDb(data, null)
      
      // Include the plant stage if provided
      if (cluster.plantStage) {
        newCluster.plantStage = cluster.plantStage
      }

      setClusters((prev) => {
        const next = [...prev, newCluster]
        persistFarmSnapshot(farm, next)
        return next
      })

      // Clean up dedup key
      processingClusters.current.delete(dedupKey)
      
      return { success: true, cluster: newCluster }
    } catch (error) {
      console.error('Error adding cluster:', error)
      // Clean up dedup key even on error
      processingClusters.current.delete(dedupKey)
      return { success: false, error: normalizeDbError(error, 'Unable to add cluster.') }
    }
  }

  const ensureActiveSeason = async (clusterId) => {
    // Check for existing active season
    const { data: existingSeasons } = await supabase
      .from('seasons')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingSeasons?.length > 0) {
      return existingSeasons[0]
    }

    // Create a default season
    const currentYear = new Date().getFullYear()
    const { data: newSeason, error } = await supabase
      .from('seasons')
      .insert({
        cluster_id: clusterId,
        year: currentYear,
        label: `Season ${currentYear}`,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating season:', error.message)
      return null
    }

    return newSeason
  }

  const updateCluster = async (clusterId, updates) => {
    const currentCluster = clusters.find((c) => c.id === clusterId)
    if (!currentCluster) {
      return { success: false, error: 'Cluster not found.' }
    }

    const basicFields = {}
    const hasStageDataVariety =
      updates.stageData && Object.prototype.hasOwnProperty.call(updates.stageData, 'variety')
    const hasExplicitVariety = Object.prototype.hasOwnProperty.call(updates, 'variety')
    const incomingVariety = hasExplicitVariety
      ? updates.variety
      : hasStageDataVariety
        ? updates.stageData.variety
        : undefined
    const normalizedIncomingVariety =
      typeof incomingVariety === 'string' ? incomingVariety.trim() : incomingVariety
    const shouldSyncVariety = incomingVariety !== undefined
    const resolvedVariety =
      shouldSyncVariety && normalizedIncomingVariety
        ? normalizedIncomingVariety
        : currentCluster.variety || null
    
    if (updates.clusterName !== undefined) basicFields.cluster_name = updates.clusterName
    if (updates.areaSize !== undefined) {
      const parsedArea = Number.parseFloat(updates.areaSize)
      basicFields.area_size_sqm = Number.isFinite(parsedArea) ? parsedArea : null
    }
    if (updates.plantCount !== undefined) {
      const parsedPlantCount = Number.parseInt(updates.plantCount, 10)
      basicFields.plant_count = Number.isInteger(parsedPlantCount) ? parsedPlantCount : null
    }
    // Note: plant_stage is no longer in clusters table
    if (shouldSyncVariety) {
      basicFields.variety = resolvedVariety
    }

    // OFFLINE MODE: Save to sync queue and optimistic cache
    if (!navigator.onLine) {
      // Only allow basic field updates offline (not complex stage/harvest data)
      if (Object.keys(basicFields).length === 0 && !updates.plantStage) {
        return { success: false, error: 'No valid fields to update offline.' }
      }

      try {
        // Check if this is an offline-created cluster
        const isOfflineCreated = currentCluster._isOffline
        
        const updatePayload = {
          id: clusterId,
          ...basicFields,
          updated_at: new Date().toISOString(),
        }
        
        await saveOfflineRecord('clusters', updatePayload, isOfflineCreated ? 'insert' : 'update')
        
        // Handle plant stage change offline
        if (updates.plantStage !== undefined && updates.plantStage !== currentCluster.plantStage) {
          // Database enum: seed-sapling, vegetative, flowering, fruiting, harvest-ready, post-harvest, dormant
          const stageMapping = {
            'seed-sapling': 'seed-sapling',
            'tree': 'vegetative',
            'flowering': 'flowering',
            'ready-to-harvest': 'harvest-ready'
          }
          const dbStage = stageMapping[updates.plantStage] || updates.plantStage
          
          const lifecycleData = {
            id: crypto.randomUUID(),
            cluster_id: clusterId,
            stage: dbStage,
            actual_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          }
          await saveOfflineRecord('cluster_lifecycle_events', lifecycleData, 'insert')
        }
        
        // Update optimistic cache
        const optimisticUpdate = {
          ...currentCluster,
          clusterName: updates.clusterName !== undefined ? updates.clusterName : currentCluster.clusterName,
          areaSize: updates.areaSize !== undefined ? updates.areaSize : currentCluster.areaSize,
          plantCount: updates.plantCount !== undefined ? updates.plantCount : currentCluster.plantCount,
          variety: updates.variety !== undefined ? updates.variety : currentCluster.variety,
          plantStage: updates.plantStage !== undefined ? updates.plantStage : currentCluster.plantStage,
          _pendingSync: true,
          _lastModified: Date.now(),
        }
        await saveOptimisticData('clusters', optimisticUpdate)

        // Update local state
        setClusters((prev) => {
          const next = prev.map((c) => c.id === clusterId ? optimisticUpdate : c)
          persistFarmSnapshot(farm, next)
          return next
        })

        return {
          success: true,
          offline: true,
          message: 'Changes saved offline. Will sync when connection is restored.'
        }
      } catch (err) {
        console.error('Failed to update cluster offline:', err)
        return { success: false, error: 'Failed to save changes offline.' }
      }
    }

    // ONLINE MODE: Direct Supabase operations
    if (Object.keys(basicFields).length > 0) {
      const { error: clusterUpdateError } = await supabase
        .from('clusters')
        .update(basicFields)
        .eq('id', clusterId)

      if (clusterUpdateError) {
        console.error('Error updating cluster:', clusterUpdateError.message)
        return { success: false, error: normalizeDbError(clusterUpdateError, 'Unable to save cluster updates.') }
      }
    }

    // Handle plant stage change via lifecycle events
    if (updates.plantStage !== undefined && updates.plantStage !== currentCluster.plantStage) {
      // Map frontend stage values to database enum values
      // Database enum: seed-sapling, vegetative, flowering, fruiting, harvest-ready, post-harvest, dormant
      const stageMapping = {
        'seed-sapling': 'seed-sapling',
        'tree': 'vegetative',
        'flowering': 'flowering',
        'ready-to-harvest': 'harvest-ready'
      }
      
      const dbStage = stageMapping[updates.plantStage] || updates.plantStage
      
      const { error: lifecycleError } = await supabase
        .from('cluster_lifecycle_events')
        .insert({
          cluster_id: clusterId,
          stage: dbStage,
          actual_date: new Date().toISOString().split('T')[0],
        })
      
      if (lifecycleError) {
        console.error('Error creating lifecycle event:', lifecycleError.message)
      }
    }

    const resolvedPlantCount =
      updates.plantCount !== undefined ? updates.plantCount : currentCluster?.plantCount
    const mergedStageData = updates.stageData
      ? { ...(currentCluster?.stageData || {}), ...updates.stageData }
      : undefined

    const shouldSyncPlantCount =
      resolvedPlantCount !== undefined && resolvedPlantCount !== null && resolvedPlantCount !== ''
    const stageDataForUpsert =
      mergedStageData || updates.plantCount !== undefined
        ? {
            ...((mergedStageData || currentCluster?.stageData || {})),
            ...(shouldSyncPlantCount ? { numberOfPlants: resolvedPlantCount } : {}),
          }
        : null

    if (stageDataForUpsert) {
      // Ensure we have an active season
      const season = await ensureActiveSeason(clusterId)
      if (!season) {
        return { success: false, error: 'Unable to create or find active season for this cluster.' }
      }

      const dbStageData = mapStageDataToDb(stageDataForUpsert)
      dbStageData.season_id = season.id

      if (Object.keys(dbStageData).length > 0) {
        // Split data into the appropriate tables
        await upsertClusterStageData(clusterId, season.id, dbStageData)
      }
    }

    const harvestPayload = mapHarvestRecordFromStageData(stageDataForUpsert || mergedStageData || updates.stageData || {})
    if (harvestPayload) {
      // Ensure cluster_id and season_id are set
      harvestPayload.cluster_id = clusterId
      const season = await ensureActiveSeason(clusterId)
      if (season) {
        harvestPayload.season_id = season.id
      }

      let harvestLookup = supabase
        .from('harvest_records')
        .select('id')
        .eq('cluster_id', clusterId)

      if (harvestPayload.season_id) {
        harvestLookup = harvestLookup.eq('season_id', harvestPayload.season_id)
      }

      const { data: existingHarvestRows, error: harvestLookupError } = await harvestLookup
        .order('recorded_at', { ascending: false })
        .limit(1)

      if (harvestLookupError) {
        console.error('Error looking up harvest_records row:', harvestLookupError.message)
        return { success: false, error: normalizeDbError(harvestLookupError, 'Unable to save harvest record.') }
      }

      const existingHarvestId = existingHarvestRows?.[0]?.id

      if (existingHarvestId) {
        const { error: updateHarvestError } = await supabase
          .from('harvest_records')
          .update(harvestPayload)
          .eq('id', existingHarvestId)

        if (updateHarvestError) {console.error('Error updating harvest record:', updateHarvestError.message)
          return { success: false, error: normalizeDbError(updateHarvestError, 'Unable to save harvest record.') }
        }
      } else {
        const { error: insertHarvestError } = await supabase
          .from('harvest_records')
          .insert(harvestPayload)

        if (insertHarvestError) {
            console.error('Error inserting harvest record:', insertHarvestError.message)
            return { success: false, error: normalizeDbError(insertHarvestError, 'Unable to save harvest record.') }
          }
        }
      }
  
      // Update local state to reflect the changes
      setClusters((prev) => {
        const next = prev.map((c) => {
          if (c.id !== clusterId) return c
          
          // Update basic fields
          const updated = { ...c }
          if (updates.clusterName !== undefined) updated.cluster_name = updates.clusterName
          if (updates.areaSize !== undefined) updated.area_size_sqm = updates.areaSize
          if (updates.plantCount !== undefined) updated.plant_count = updates.plantCount
          if (updates.variety !== undefined) updated.variety = updates.variety
          if (updates.plantStage !== undefined) updated.plantStage = updates.plantStage
          
          // Update stageData if provided
          if (updates.stageData) {
            updated.stageData = { ...(c.stageData || {}), ...updates.stageData }
          }
          
          return updated
        })
        
        // Persist to cache
        persistFarmSnapshot(farm, next)
        return next
      })
  
      return { success: true }
    }

  const deleteCluster = async (clusterId) => {
    const clusterToDelete = clusters.find((c) => c.id === clusterId)
    if (!clusterToDelete) {
      return { success: false, error: 'Cluster not found.' }
    }

    // OFFLINE MODE
    if (!navigator.onLine) {
      try {
        // If cluster was created offline, just remove from optimistic cache and pending queue
        if (clusterToDelete._isOffline) {
          await removePendingOperationsForRecord(clusterId)
        } else {
          // Queue delete operation for existing cluster
          await saveOfflineRecord('clusters', { id: clusterId }, 'delete')
        }

        // Update local state immediately
        setClusters((prev) => {
          const next = prev.filter((c) => c.id !== clusterId)
          persistFarmSnapshot(farm, next)
          return next
        })

        return { 
          success: true, 
          offline: true,
          message: 'Cluster deleted. Will sync when connection is restored.'
        }
      } catch (err) {
        console.error('Failed to delete cluster offline:', err)
        return { success: false, error: 'Failed to delete cluster offline.' }
      }
    }

    // ONLINE MODE
    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('id', clusterId)

    if (error) {
      console.error('Error deleting cluster:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to delete cluster.') }
    }

    setClusters((prev) => {
      const next = prev.filter((c) => c.id !== clusterId)
      persistFarmSnapshot(farm, next)
      return next
    })

    return { success: true }
  }

  const refreshClusters = async () => {
    if (!farm?.id) return { success: false, error: 'No farm loaded.' }

    try {
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .eq('farm_id', farm.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error refreshing clusters:', error.message)
        return { success: false, error: normalizeDbError(error, 'Unable to refresh clusters.') }
      }

      const normalized = (data || []).map((row) => mapClusterFromDb(row, null))
      setClusters(normalized)
      persistFarmSnapshot(farm, normalized)
      return { success: true, clusters: normalized }
    } catch (err) {
      console.error('refreshClusters error:', err)
      return { success: false, error: 'Unable to refresh clusters.' }
    }
  }

  const addHarvestRecord = async (clusterId, record) => {
    // Ensure season_id is set
    const season = await ensureActiveSeason(clusterId)
    if (!season) {
      return { success: false, error: 'Unable to create or find active season for this cluster.' }
    }

    // Helper function to convert null/undefined to 0 for numeric fields
    const toDbNumber = (val) => (val === null || val === undefined || val === '') ? 0 : Number(val)
    
    const { error } = await supabase
      .from('harvest_records')
      .insert({
        cluster_id: clusterId,
        season_id: season.id,
        actual_harvest_date: record.actualHarvestDate || null,
        yield_kg: Number(record.yieldKg) || 0.001, // Must be > 0 due to constraint
        grade_fine: toDbNumber(record.gradeFine),
        grade_premium: toDbNumber(record.gradePremium),
        grade_commercial: toDbNumber(record.gradeCommercial),
        grading_method: record.gradingMethod || null,
        defect_count: toDbNumber(record.defectCount),
        bean_moisture: toDbNumber(record.beanMoisture),
        bean_screen_size: record.beanScreenSize || null,
        notes: record.notes || null,
      })

    if (error) {
      console.error('Error adding harvest record:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to add harvest record.') }
    }

    // Refresh clusters to include the new harvest record
    await refreshClusters()

    return { success: true }
  }

  const updateHarvestRecord = async (clusterId, recordId, updates) => {
    // Helper function to convert null/undefined to 0 for numeric fields
    const toDbNumber = (val) => (val === null || val === undefined || val === '') ? 0 : Number(val)
    
    const { error } = await supabase
      .from('harvest_records')
      .update({
        actual_harvest_date: updates.actualHarvestDate || null,
        yield_kg: updates.yieldKg ? Number(updates.yieldKg) : undefined, // Only update if provided
        grade_fine: toDbNumber(updates.gradeFine),
        grade_premium: toDbNumber(updates.gradePremium),
        grade_commercial: toDbNumber(updates.gradeCommercial),
        grading_method: updates.gradingMethod || null,
        defect_count: toDbNumber(updates.defectCount),
        bean_moisture: toDbNumber(updates.beanMoisture),
        bean_screen_size: updates.beanScreenSize || null,
        notes: updates.notes || null,
      })
      .eq('id', recordId)

    if (error) {
      console.error('Error updating harvest record:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to update harvest record.') }
    }

    // Refresh clusters to include the updated harvest record
    await refreshClusters()

    return { success: true }
  }

  const deleteHarvestRecord = async (clusterId, recordId) => {
    const { error } = await supabase
      .from('harvest_records')
      .delete()
      .eq('id', recordId)

    if (error) {
      console.error('Error deleting harvest record:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to delete harvest record.') }
    }

    // Refresh clusters to remove the deleted harvest record
    await refreshClusters()

    return { success: true }
  }

  const upsertClusterStageData = async (clusterId, seasonId, data) => {
    try {
      // Only include fields that have actual values (not null/undefined)
      // This prevents overwriting existing data with nulls
      const agronomicData = {
        cluster_id: clusterId,
        season_id: seasonId,
      }
      
      // Only add agronomic fields if they have values
      if (data.date_planted !== undefined && data.date_planted !== null) agronomicData.date_planted = data.date_planted
      if (data.plant_age_months !== undefined && data.plant_age_months !== null) agronomicData.plant_age_months = data.plant_age_months
      if (data.number_of_plants !== undefined && data.number_of_plants !== null) agronomicData.number_of_plants = data.number_of_plants
      if (data.fertilizer_type !== undefined && data.fertilizer_type !== null) agronomicData.fertilizer_type = data.fertilizer_type
      if (data.fertilizer_frequency !== undefined && data.fertilizer_frequency !== null) agronomicData.fertilizer_frequency = data.fertilizer_frequency
      if (data.pesticide_type !== undefined && data.pesticide_type !== null) agronomicData.pesticide_type = data.pesticide_type
      if (data.pesticide_frequency !== undefined && data.pesticide_frequency !== null) agronomicData.pesticide_frequency = data.pesticide_frequency
      if (data.last_pruned_date !== undefined && data.last_pruned_date !== null) agronomicData.last_pruned_date = data.last_pruned_date
      if (data.previous_pruned_date !== undefined && data.previous_pruned_date !== null) agronomicData.previous_pruned_date = data.previous_pruned_date
      if (data.pruning_interval_months !== undefined && data.pruning_interval_months !== null) agronomicData.pruning_interval_months = data.pruning_interval_months
      if (data.shade_tree_present !== undefined && data.shade_tree_present !== null) agronomicData.shade_tree_present = data.shade_tree_present
      if (data.shade_tree_species !== undefined && data.shade_tree_species !== null) agronomicData.shade_tree_species = data.shade_tree_species

      // Only save agronomic config if we have data beyond the required IDs
      if (Object.keys(agronomicData).length > 2) {
        // Try to update existing record first
        const { error: updateError } = await supabase
          .from('cluster_agronomic_config')
          .update(agronomicData)
          .eq('cluster_id', clusterId)
          .eq('season_id', seasonId)

        if (updateError) {
          // If update fails (record doesn't exist), insert new record
          const { error: insertError } = await supabase
            .from('cluster_agronomic_config')
            .insert(agronomicData)
          
          if (insertError) {
            console.error('Error saving agronomic config:', insertError.message)
          }
        }
      }

      // Only save monitoring records if we have actual monitoring data
      const hasMonitoringData = data.soil_ph !== undefined && data.soil_ph !== null ||
                                data.avg_temp_c !== undefined && data.avg_temp_c !== null ||
                                data.avg_rainfall_mm !== undefined && data.avg_rainfall_mm !== null ||
                                data.avg_humidity_pct !== undefined && data.avg_humidity_pct !== null

      if (hasMonitoringData) {
        const now = new Date()
        const month = now.getMonth() + 1 // Current month (1-12)
        const year = now.getFullYear()
        
        const monitoringData = {
          cluster_id: clusterId,
          season_id: seasonId,
          month: month,
          year: year,
        }
        
        if (data.soil_ph !== undefined && data.soil_ph !== null) monitoringData.soil_ph = data.soil_ph
        if (data.avg_temp_c !== undefined && data.avg_temp_c !== null) monitoringData.avg_temp_c = data.avg_temp_c
        if (data.avg_rainfall_mm !== undefined && data.avg_rainfall_mm !== null) monitoringData.avg_rainfall_mm = data.avg_rainfall_mm
        if (data.avg_humidity_pct !== undefined && data.avg_humidity_pct !== null) monitoringData.avg_humidity_pct = data.avg_humidity_pct

        // Try to update existing record first, then insert if not found
        const { error: updateError } = await supabase
          .from('cluster_monitoring_records')
          .update(monitoringData)
          .eq('cluster_id', clusterId)
          .eq('season_id', seasonId)
          .eq('month', month)
          .eq('year', year)

        if (updateError) {
          // If update fails, try to insert
          const { error: insertError } = await supabase
            .from('cluster_monitoring_records')
            .insert(monitoringData)
          
          if (insertError) {
            console.error('Error saving monitoring data:', insertError.message)
          }
        }
      }

    } catch (err) {
      console.error('upsertClusterStageData error:', err)
    }
  }

  // Get a specific cluster by ID
  const getCluster = useCallback((clusterId) => {
    return clusters.find((c) => c.id === clusterId) || null
  }, [clusters])

  // Get all clusters (for HarvestRecords component)
  const getAllClusters = useCallback(() => {
    return clusters
  }, [clusters])

  // Remove clusters by their client IDs (used after sync to remove offline clusters)
  const removeClustersByClientIds = useCallback((clientIds) => {
    if (!clientIds || clientIds.length === 0) return
    
    setClusters((prev) => {
      const next = prev.filter((c) => !clientIds.includes(c.id))
      console.log(`Removed ${prev.length - next.length} offline clusters from state`)
      persistFarmSnapshot(farm, next)
      return next
    })
  }, [farm, persistFarmSnapshot])

  const value = {
    farm,
    clusters,
    loading,
    getCluster,
    getAllClusters,
    refreshClusters,
    setFarmInfo,
    addCluster,
    updateCluster,
    deleteCluster,
    addHarvestRecord,
    updateHarvestRecord,
    deleteHarvestRecord,
    fetchFarmData,
    removeClustersByClientIds,
  }

  return (
    <FarmContext.Provider value={value}>
      {children}
    </FarmContext.Provider>
  )
}

// Helper functions
export const useFarm = () => {
  const context = useContext(FarmContext)
  if (context === null) {
    throw new Error('useFarm must be used within a FarmProvider')
  }
  return context
}

function normalizeDbError(error, defaultMessage) {
  if (error?.code === '23505') {
    return 'This name is already in use. Please choose a different one.'
  }
  if (error?.message) {
    return `${defaultMessage}: ${error.message}`
  }
  return defaultMessage
}

function mapFarmFromDb(row) {
  return {
    id: row.id,
    userId: row.user_id,
    farmName: row.farm_name,
    farmArea: row.farm_area,
    elevation: row.elevation_m,
    plantVariety: row.plant_variety,
    overallTreeCount: row.overall_tree_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapClusterFromDb(row, stageData) {
  return {
    id: row.id,
    farmId: row.farm_id,
    clusterName: row.cluster_name,
    areaSize: row.area_size_sqm,
    plantCount: row.plant_count,
    variety: row.variety,
    stageData: stageData || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapStageDataFromDb(row) {
  return {
    datePlanted: row.date_planted,
    plantAgeMonths: row.plant_age_months,
    numberOfPlants: row.number_of_plants,
    fertilizerType: row.fertilizer_type,
    fertilizerFrequency: row.fertilizer_frequency,
    pesticideType: row.pesticide_type,
    pesticideFrequency: row.pesticide_frequency,
    lastPrunedDate: row.last_pruned_date,
    previousPrunedDate: row.previous_pruned_date,
    pruningIntervalMonths: row.pruning_interval_months,
    shadeTreePresent: row.shade_tree_present,
    shadeTreeSpecies: row.shade_tree_species,
    soilPh: row.soil_ph,
    avgTempC: row.avg_temp_c,
    avgRainfallMm: row.avg_rainfall_mm,
    avgHumidityPct: row.avg_humidity_pct,
  }
}

function mapStageDataToDb(data) {
  return {
    date_planted: data.datePlanted,
    plant_age_months: data.plantAgeMonths,
    number_of_plants: data.numberOfPlants,
    fertilizer_type: data.fertilizerType,
    fertilizer_frequency: data.fertilizerFrequency,
    pesticide_type: data.pesticideType,
    pesticide_frequency: data.pesticideFrequency,
    last_pruned_date: data.lastPrunedDate,
    previous_pruned_date: data.previousPrunedDate,
    pruning_interval_months: data.pruningIntervalMonths,
    shade_tree_present: data.shadeTreePresent,
    shade_tree_species: data.shadeTreeSpecies,
    soil_ph: data.soilPh,
    avg_temp_c: data.avgTempC,
    avg_rainfall_mm: data.avgRainfallMm,
    avg_humidity_pct: data.avgHumidityPct,
  }
}

function mapHarvestRecordFromStageData(data) {
  // Only return harvest data if there's actual yield data to save
  // This prevents trying to save empty harvest records when editing other sections
  if (!data || data.yieldKg === undefined || data.yieldKg === null || data.yieldKg === '') {
    return null
  }

  return {
    yield_kg: data.yieldKg,
    grade_fine: data.gradeFine,
    grade_premium: data.gradePremium,
    grade_commercial: data.gradeCommercial,
    grading_method: data.gradingMethod,
    defect_count: data.defectCount,
    bean_moisture: data.beanMoisture,
    bean_screen_size: data.beanScreenSize,
    notes: data.notes,
  }
}

function getStageDataFromNestedRow(clusterRow) {
  return null
}
