import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { getCached, setCached, clearCachedByPrefix } from '../lib/queryCache'

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

  const fetchFarmData = useCallback(async () => {
    if (!authUser) {
      clearCachedByPrefix('farm_context:')
      setFarm(null)
      setClusters([])
      setLoading(false)
      return
    }

    const cacheKey = farmCacheKey(authUser.id)
    const cachedSnapshot = getCached(cacheKey, FARM_CACHE_TTL_MS)
    if (cachedSnapshot?.farm) {
      setFarm(cachedSnapshot.farm)
      setClusters(Array.isArray(cachedSnapshot.clusters) ? cachedSnapshot.clusters : [])
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      // Pre-aggregate related data in one request for faster page hydration.
      const { data: farmRow, error: farmErr } = await supabase
        .from('farms')
        .select('*, clusters(*, cluster_stage_data(*))')
        .eq('user_id', authUser.id)
        .maybeSingle()

      if (farmErr) {
        console.error('Error fetching farm:', farmErr.message)
        return
      }

      if (farmRow) {
        const { clusters: clusterRows = [], ...farmOnly } = farmRow
        const previousStageDataByClusterId = new Map(
          (Array.isArray(cachedSnapshot?.clusters) ? cachedSnapshot.clusters : [])
            .filter((cluster) => cluster?.id)
            .map((cluster) => [cluster.id, cluster.stageData || null])
        )

        const clusterIds = (clusterRows || []).map((clusterRow) => clusterRow.id).filter(Boolean)
        let directStageDataByClusterId = new Map()

        if (clusterIds.length > 0) {
          const { data: stageRows, error: stageErr } = await supabase
            .from('cluster_stage_data')
            .select('*')
            .in('cluster_id', clusterIds)

          if (stageErr) {
            console.error('Error fetching cluster_stage_data:', stageErr.message)
          } else {
            directStageDataByClusterId = new Map(
              (stageRows || []).map((row) => [row.cluster_id, mapStageDataFromDb(row)])
            )
          }
        }

        const normalizedClusters = [...(clusterRows || [])]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((clusterRow) =>
            mapClusterFromDb(
              clusterRow,
              directStageDataByClusterId.get(clusterRow.id) ||
                getStageDataFromNestedRow(clusterRow) ||
                previousStageDataByClusterId.get(clusterRow.id) ||
                null
            )
          )

        setFarm(farmOnly)
        setClusters(normalizedClusters)
        persistFarmSnapshot(farmOnly, normalizedClusters)
      } else {
        const { data: newFarm, error: createErr } = await supabase
          .from('farms')
          .insert({ user_id: authUser.id, farm_name: 'My Farm' })
          .select()
          .single()

        if (createErr) {
          console.error('Error creating farm:', createErr.message)
        } else {
          setFarm(newFarm)
          persistFarmSnapshot(newFarm, [])
        }
        setClusters([])
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
    if (!farm) return
    const { data } = await supabase
      .from('farms')
      .update({
        farm_name: farmData.farmName,
        farm_area: farmData.farmArea || null,
        elevation: farmData.elevation || null,
        plant_variety: farmData.plantVariety || null,
        overall_tree_count: farmData.overallTreeCount || null,
      })
      .eq('id', farm.id)
      .select()
      .single()
    if (data) {
      setFarm(data)
      persistFarmSnapshot(data, clusters)
    }
  }

  const addCluster = async (cluster) => {
    if (!farm) return null
    const { data, error } = await supabase
      .from('clusters')
      .insert({
        farm_id: farm.id,
        cluster_name: cluster.clusterName,
        area_size: cluster.areaSize,
        plant_count: cluster.plantCount,
        plant_stage: cluster.plantStage,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding cluster:', error.message)
      return null
    }

    const newCluster = {
      id: data.id,
      clusterName: data.cluster_name,
      areaSize: data.area_size,
      plantCount: data.plant_count,
      plantStage: data.plant_stage,
      createdAt: data.created_at,
      stageData: null,
      harvestRecords: [],
    }

    setClusters((prev) => {
      const next = [...prev, newCluster]
      persistFarmSnapshot(farm, next)
      return next
    })

    return newCluster
  }

  const updateCluster = async (clusterId, updates) => {
    const basicFields = {}
    if (updates.clusterName !== undefined) basicFields.cluster_name = updates.clusterName
    if (updates.areaSize !== undefined) basicFields.area_size = updates.areaSize
    if (updates.plantCount !== undefined) basicFields.plant_count = updates.plantCount
    if (updates.plantStage !== undefined) basicFields.plant_stage = updates.plantStage

    if (Object.keys(basicFields).length > 0) {
      await supabase.from('clusters').update(basicFields).eq('id', clusterId)
    }

    const currentCluster = clusters.find((c) => c.id === clusterId)
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
      const dbStageData = mapStageDataToDb(stageDataForUpsert)
      dbStageData.cluster_id = clusterId

      await supabase
        .from('cluster_stage_data')
        .upsert(dbStageData, { onConflict: 'cluster_id' })
    }

    setClusters((prev) => {
      const next = prev.map((c) => {
        if (c.id !== clusterId) return c

        const localStageData =
          mergedStageData || updates.plantCount !== undefined
            ? {
                ...((mergedStageData || c.stageData || {})),
                ...(shouldSyncPlantCount ? { numberOfPlants: resolvedPlantCount } : {}),
              }
            : undefined

        return {
          ...c,
          ...(updates.clusterName !== undefined && { clusterName: updates.clusterName }),
          ...(updates.areaSize !== undefined && { areaSize: updates.areaSize }),
          ...(updates.plantCount !== undefined && { plantCount: updates.plantCount }),
          ...(updates.plantStage !== undefined && { plantStage: updates.plantStage }),
          ...(localStageData !== undefined && { stageData: localStageData }),
        }
      })
      persistFarmSnapshot(farm, next)
      return next
    })
  }

  const deleteCluster = async (clusterId) => {
    await supabase.from('clusters').delete().eq('id', clusterId)
    setClusters((prev) => {
      const next = prev.filter((c) => c.id !== clusterId)
      persistFarmSnapshot(farm, next)
      return next
    })
  }

  const addHarvestRecord = async (clusterId, record) => {
    const { data, error } = await supabase
      .from('harvest_records')
      .insert({
        cluster_id: clusterId,
        season: record.season || null,
        yield_kg: record.yieldKg || null,
        grade_fine: record.gradeFine || null,
        grade_premium: record.gradePremium || null,
        grade_commercial: record.gradeCommercial || null,
        notes: record.notes || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding harvest record:', error.message)
      return
    }

    setClusters((prev) => {
      const next = prev.map((c) =>
        c.id === clusterId
          ? { ...c, harvestRecords: [...(c.harvestRecords || []), data] }
          : c
      )
      persistFarmSnapshot(farm, next)
      return next
    })
  }

  const getCluster = (clusterId) => clusters.find((c) => c.id === clusterId)

  const getAllClusters = () => {
    return clusters.map((c) => ({ ...c, farmName: farm?.farm_name || 'My Farm' }))
  }

  const getHarvestReadyClusters = () => {
    return getAllClusters().filter((c) =>
      ['ready-to-harvest', 'flowering', 'fruit-bearing'].includes(c.plantStage)
    )
  }

  return (
    <FarmContext.Provider
      value={{
        farm,
        setFarmInfo,
        clusters,
        loading,
        addCluster,
        updateCluster,
        deleteCluster,
        addHarvestRecord,
        getCluster,
        getAllClusters,
        getHarvestReadyClusters,
        refreshData: fetchFarmData,
      }}
    >
      {children}
    </FarmContext.Provider>
  )
}

export function useFarm() {
  const context = useContext(FarmContext)
  if (!context) throw new Error('useFarm must be used within FarmProvider')
  return context
}

function mapClusterFromDb(row, stageDataOverride = null) {
  return {
    id: row.id,
    clusterName: row.cluster_name,
    areaSize: row.area_size,
    plantCount: row.plant_count,
    plantStage: row.plant_stage,
    createdAt: row.created_at,
    stageData: stageDataOverride,
    harvestRecords: [],
  }
}

function getStageDataFromNestedRow(row) {
  const nested = row?.cluster_stage_data
  if (!nested) return null
  if (Array.isArray(nested)) {
    return nested[0] ? mapStageDataFromDb(nested[0]) : null
  }
  if (typeof nested === 'object') {
    return mapStageDataFromDb(nested)
  }
  return null
}

function mapStageDataFromDb(row) {
  return {
    datePlanted: row.date_planted || '',
    numberOfPlants: row.number_of_plants ?? '',
    variety: row.variety || '',
    fertilizerFrequency: row.fertilizer_frequency || '',
    fertilizerType: row.fertilizer_type || '',
    pesticideType: row.pesticide_type || '',
    pesticideFrequency: row.pesticide_frequency || '',
    monthlyTemperature: row.monthly_temperature ?? '',
    rainfall: row.rainfall ?? '',
    humidity: row.humidity ?? '',
    soilPh: row.soil_ph ?? '',
    lastHarvestedDate: row.last_harvested_date || '',
    previousYield: row.previous_yield ?? '',
    lastPrunedDate: row.last_pruned_date || '',
    shadeTrees: row.shade_trees || '',
    estimatedFloweringDate: row.estimated_flowering_date || '',
    harvestDate: row.harvest_date || '',
    predictedYield: row.predicted_yield ?? '',
    harvestSeason: row.harvest_season || '',
    currentYield: row.current_yield ?? '',
    gradeFine: row.grade_fine ?? '',
    gradePremium: row.grade_premium ?? '',
    gradeCommercial: row.grade_commercial ?? '',
    estimatedHarvestDate: row.estimated_harvest_date || '',
    preLastHarvestDate: row.pre_last_harvest_date || '',
    preTotalTrees: row.pre_total_trees ?? '',
    preYieldKg: row.pre_yield_kg ?? '',
    preGradeFine: row.pre_grade_fine ?? '',
    preGradePremium: row.pre_grade_premium ?? '',
    preGradeCommercial: row.pre_grade_commercial ?? '',
    postCurrentYield: row.post_current_yield ?? '',
    postGradeFine: row.post_grade_fine ?? '',
    postGradePremium: row.post_grade_premium ?? '',
    postGradeCommercial: row.post_grade_commercial ?? '',
    defectCount: row.defect_count ?? '',
    beanMoisture: row.bean_moisture ?? '',
    beanScreenSize: row.bean_screen_size || '',
  }
}

function mapStageDataToDb(sd = {}) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : parseFloat(v))
  const int = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10))
  const str = (v) => (v === '' ? null : v || null)
  const dt = (v) => (v === '' ? null : v || null)

  const fieldMap = {
    datePlanted: ['date_planted', dt],
    numberOfPlants: ['number_of_plants', int],
    variety: ['variety', str],
    fertilizerFrequency: ['fertilizer_frequency', str],
    fertilizerType: ['fertilizer_type', str],
    pesticideType: ['pesticide_type', str],
    pesticideFrequency: ['pesticide_frequency', str],
    monthlyTemperature: ['monthly_temperature', num],
    rainfall: ['rainfall', num],
    humidity: ['humidity', num],
    soilPh: ['soil_ph', num],
    lastHarvestedDate: ['last_harvested_date', dt],
    previousYield: ['previous_yield', num],
    lastPrunedDate: ['last_pruned_date', dt],
    shadeTrees: ['shade_trees', str],
    estimatedFloweringDate: ['estimated_flowering_date', dt],
    harvestDate: ['harvest_date', dt],
    predictedYield: ['predicted_yield', num],
    harvestSeason: ['harvest_season', str],
    currentYield: ['current_yield', num],
    gradeFine: ['grade_fine', num],
    gradePremium: ['grade_premium', num],
    gradeCommercial: ['grade_commercial', num],
    estimatedHarvestDate: ['estimated_harvest_date', dt],
    preLastHarvestDate: ['pre_last_harvest_date', dt],
    preTotalTrees: ['pre_total_trees', int],
    preYieldKg: ['pre_yield_kg', num],
    preGradeFine: ['pre_grade_fine', num],
    preGradePremium: ['pre_grade_premium', num],
    preGradeCommercial: ['pre_grade_commercial', num],
    postCurrentYield: ['post_current_yield', num],
    postGradeFine: ['post_grade_fine', num],
    postGradePremium: ['post_grade_premium', num],
    postGradeCommercial: ['post_grade_commercial', num],
    defectCount: ['defect_count', int],
    beanMoisture: ['bean_moisture', num],
    beanScreenSize: ['bean_screen_size', str],
  }

  return Object.entries(fieldMap).reduce((acc, [clientKey, [dbKey, transform]]) => {
    if (Object.prototype.hasOwnProperty.call(sd, clientKey)) {
      acc[dbKey] = transform(sd[clientKey])
    }
    return acc
  }, {})
}
