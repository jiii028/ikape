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
        .select('*, clusters(*, cluster_stage_data(*), harvest_records(*))')
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
            .order('updated_at', { ascending: false })
            .in('cluster_id', clusterIds)

          if (stageErr) {
            console.error('Error fetching cluster_stage_data:', stageErr.message)
          } else {
            const latestRowsByClusterId = new Map()
            ;(stageRows || []).forEach((row) => {
              if (!latestRowsByClusterId.has(row.cluster_id)) {
                latestRowsByClusterId.set(row.cluster_id, row)
              }
            })
            directStageDataByClusterId = new Map(
              [...latestRowsByClusterId.entries()].map(([clusterId, row]) => [clusterId, mapStageDataFromDb(row)])
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

        const normalizedFarm = mapFarmFromDb(farmOnly)
        setFarm(normalizedFarm)
        setClusters(normalizedClusters)
        persistFarmSnapshot(normalizedFarm, normalizedClusters)
      } else {
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
    if (!farm?.id) {
      return { success: false, error: 'Farm record is not available yet. Please refresh and try again.' }
    }

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

    const { data, error } = await supabase
      .from('clusters')
      .insert({
        farm_id: farm.id,
        cluster_name: cluster.clusterName,
        area_size_sqm: Number.isFinite(areaSize) ? areaSize : null,
        plant_count: Number.isInteger(plantCount) ? plantCount : null,
        plant_stage: cluster.plantStage,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding cluster:', error.message)
      return { success: false, error: normalizeDbError(error, 'Unable to add cluster.') }
    }

    const newCluster = mapClusterFromDb(data, null)

    setClusters((prev) => {
      const next = [...prev, newCluster]
      persistFarmSnapshot(farm, next)
      return next
    })

    return { success: true, cluster: newCluster }
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
    if (updates.plantStage !== undefined) basicFields.plant_stage = updates.plantStage
    if (shouldSyncVariety) {
      basicFields.variety = resolvedVariety
    }

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
      if (!dbStageData.season) {
        dbStageData.season = inferStageSeason(stageDataForUpsert)
      }

      if (Object.keys(dbStageData).length > 0) {
        const { error: insertStageError } = await supabase
          .from('cluster_stage_data')
          .insert({
            cluster_id: clusterId,
            ...dbStageData,
          })

        if (insertStageError) {
          // Backward compatibility for schemas that enforce one row per cluster.
          if (insertStageError.code === '23505') {
            const { error: fallbackUpdateError } = await supabase
              .from('cluster_stage_data')
              .update(dbStageData)
              .eq('cluster_id', clusterId)

            if (fallbackUpdateError) {
              console.error('Error updating cluster_stage_data fallback:', fallbackUpdateError.message)
              return { success: false, error: normalizeDbError(fallbackUpdateError, 'Unable to save cluster stage data.') }
            }
          } else {
            console.error('Error inserting cluster_stage_data:', insertStageError.message)
            return { success: false, error: normalizeDbError(insertStageError, 'Unable to create cluster stage data.') }
          }
        }
      }
    }

    const harvestPayload = mapHarvestRecordFromStageData(updates.stageData || {})
    if (harvestPayload) {
      const { error: insertHarvestError } = await supabase
        .from('harvest_records')
        .insert({
          cluster_id: clusterId,
          ...harvestPayload,
        })

      if (insertHarvestError) {
        console.error('Error inserting harvest_records:', insertHarvestError.message)
        return { success: false, error: normalizeDbError(insertHarvestError, 'Unable to create harvest record.') }
      }
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

        const stageDataWithVariety =
          shouldSyncVariety
            ? {
                ...((localStageData !== undefined ? localStageData : c.stageData) || {}),
                variety: resolvedVariety || '',
              }
            : localStageData

        return {
          ...c,
          ...(updates.clusterName !== undefined && { clusterName: updates.clusterName }),
          ...(updates.areaSize !== undefined && { areaSize: updates.areaSize }),
          ...(updates.plantCount !== undefined && { plantCount: updates.plantCount }),
          ...(updates.plantStage !== undefined && { plantStage: updates.plantStage }),
          ...(shouldSyncVariety
            ? { variety: resolvedVariety || '' }
            : {}),
          ...(stageDataWithVariety !== undefined && { stageData: stageDataWithVariety }),
        }
      })
      persistFarmSnapshot(farm, next)
      return next
    })

    return { success: true }
  }

  const deleteCluster = async (clusterId) => {
    const { error } = await supabase.from('clusters').delete().eq('id', clusterId)
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
      return { success: false, error: normalizeDbError(error, 'Unable to add harvest record.') }
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

    return { success: true, record: data }
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

function mapFarmFromDb(row) {
  if (!row) return null

  const elevationValue = row.elevation_m ?? row.elevation ?? null

  return {
    ...row,
    elevation_m: elevationValue,
    // Backward-compatible alias used across existing UI.
    elevation: elevationValue,
  }
}

function mapClusterFromDb(row, stageDataOverride = null) {
  const harvestRecords = Array.isArray(row.harvest_records)
    ? [...row.harvest_records].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    : []
  const latestHarvest = harvestRecords[0] || null

  const rowVariety = row.variety || ''
  const overrideVariety =
    stageDataOverride && Object.prototype.hasOwnProperty.call(stageDataOverride, 'variety')
      ? stageDataOverride.variety
      : undefined
  const normalizedOverrideVariety =
    typeof overrideVariety === 'string' ? overrideVariety.trim() : overrideVariety

  const mergedStageData = {
    ...(stageDataOverride || {}),
    variety: normalizedOverrideVariety || rowVariety,
  }

  if (latestHarvest) {
    if (isEmptyValue(mergedStageData.currentYield)) {
      mergedStageData.currentYield = latestHarvest.yield_kg ?? ''
    }
    if (isEmptyValue(mergedStageData.gradeFine)) {
      mergedStageData.gradeFine = latestHarvest.grade_fine ?? ''
    }
    if (isEmptyValue(mergedStageData.gradePremium)) {
      mergedStageData.gradePremium = latestHarvest.grade_premium ?? ''
    }
    if (isEmptyValue(mergedStageData.gradeCommercial)) {
      mergedStageData.gradeCommercial = latestHarvest.grade_commercial ?? ''
    }
    if (isEmptyValue(mergedStageData.harvestDate)) {
      mergedStageData.harvestDate = latestHarvest.actual_harvest_date || ''
    }
    if (isEmptyValue(mergedStageData.lastHarvestedDate)) {
      mergedStageData.lastHarvestedDate = latestHarvest.actual_harvest_date || ''
    }
    if (isEmptyValue(mergedStageData.harvestSeason)) {
      mergedStageData.harvestSeason = latestHarvest.season || ''
    }
  }

  return {
    id: row.id,
    farmId: row.farm_id,
    clusterName: row.cluster_name,
    areaSize: row.area_size_sqm ?? row.area_size ?? '',
    plantCount: row.plant_count,
    plantStage: row.plant_stage,
    variety: row.variety || '',
    createdAt: row.created_at,
    stageData: mergedStageData,
    harvestRecords,
  }
}

function getStageDataFromNestedRow(row) {
  const nested = row?.cluster_stage_data
  if (!nested) return null
  if (Array.isArray(nested)) {
    if (!nested.length) return null
    const latest = [...nested]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0]
    return latest ? mapStageDataFromDb(latest) : null
  }
  if (typeof nested === 'object') {
    return mapStageDataFromDb(nested)
  }
  return null
}

function mapStageDataFromDb(row) {
  const shadeTreeValue =
    typeof row.shade_tree_present === 'boolean'
      ? row.shade_tree_present
        ? 'Yes'
        : 'No'
      : row.shade_trees || ''

  return {
    datePlanted: row.date_planted || '',
    numberOfPlants: row.number_of_plants ?? '',
    fertilizerFrequency: fromFrequencyEnum(row.fertilizer_frequency),
    fertilizerType: fromTypeEnum(row.fertilizer_type),
    pesticideType: fromTypeEnum(row.pesticide_type),
    pesticideFrequency: fromFrequencyEnum(row.pesticide_frequency),
    monthlyTemperature: row.avg_temp_c ?? row.monthly_temperature ?? '',
    rainfall: row.avg_rainfall_mm ?? row.rainfall ?? '',
    humidity: row.avg_humidity_pct ?? row.humidity ?? '',
    floodRiskLevel: row.flood_risk_level || '',
    floodEventsCount: row.flood_events_count ?? '',
    floodLastEventDate: row.flood_last_event_date || '',
    soilPh: row.soil_ph ?? '',
    lastHarvestedDate: row.actual_harvest_date || row.last_harvested_date || '',
    previousYield: row.pre_yield_kg ?? row.previous_yield ?? '',
    lastPrunedDate: row.last_pruned_date || '',
    shadeTrees: shadeTreeValue,
    estimatedFloweringDate: row.estimated_flowering_date || '',
    actualFloweringDate: row.actual_flowering_date || '',
    harvestDate: row.actual_harvest_date || row.harvest_date || '',
    predictedYield: row.predicted_yield ?? '',
    harvestSeason: row.season || row.harvest_season || '',
    currentYield: row.current_yield ?? '',
    gradeFine: row.previous_fine_pct ?? row.grade_fine ?? '',
    gradePremium: row.previous_premium_pct ?? row.grade_premium ?? '',
    gradeCommercial: row.previous_commercial_pct ?? row.grade_commercial ?? '',
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
    beanSizeMm: row.bean_size_mm ?? '',
    beanScreenSize: row.bean_screen_size || '',
    defectBlackPct: row.defect_black_pct ?? '',
    defectMoldInfestedPct: row.defect_mold_infested_pct ?? '',
    defectImmaturePct: row.defect_immature_pct ?? '',
    defectBrokenPct: row.defect_broken_pct ?? '',
    defectDriedCherriesPct: row.defect_dried_cherries_pct ?? '',
    defectForeignMatterPct: row.defect_foreign_matter_pct ?? '',
    pnsTotalDefectsPct: row.pns_total_defects_pct ?? '',
    pnsQualityClass: row.pns_quality_class || '',
    pnsComplianceStatus: row.pns_compliance_status || '',
  }
}

function mapStageDataToDb(sd = {}) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number.parseFloat(v))
  const int = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10))
  const str = (v) => (v === '' || v === null || v === undefined ? null : String(v).trim())
  const dt = (v) => (v === '' || v === null || v === undefined ? null : v)

  const mapped = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(sd, key)

  if (has('datePlanted')) mapped.date_planted = dt(sd.datePlanted)
  if (has('numberOfPlants')) mapped.number_of_plants = int(sd.numberOfPlants)
  if (has('fertilizerType')) mapped.fertilizer_type = toTypeEnum(sd.fertilizerType)
  if (has('fertilizerFrequency')) mapped.fertilizer_frequency = toFrequencyEnum(sd.fertilizerFrequency)
  if (has('pesticideType')) mapped.pesticide_type = toTypeEnum(sd.pesticideType)
  if (has('pesticideFrequency')) mapped.pesticide_frequency = toFrequencyEnum(sd.pesticideFrequency)
  if (has('lastPrunedDate')) mapped.last_pruned_date = dt(sd.lastPrunedDate)
  if (has('soilPh')) mapped.soil_ph = num(sd.soilPh)
  if (has('monthlyTemperature')) mapped.avg_temp_c = num(sd.monthlyTemperature)
  if (has('rainfall')) mapped.avg_rainfall_mm = num(sd.rainfall)
  if (has('humidity')) mapped.avg_humidity_pct = num(sd.humidity)
  if (has('floodRiskLevel')) mapped.flood_risk_level = (str(sd.floodRiskLevel) || '').toLowerCase().replace(/[_\s]+/g, '-') || null
  if (has('floodEventsCount')) mapped.flood_events_count = int(sd.floodEventsCount)
  if (has('floodLastEventDate')) mapped.flood_last_event_date = dt(sd.floodLastEventDate)
  if (has('estimatedFloweringDate')) mapped.estimated_flowering_date = dt(sd.estimatedFloweringDate)
  if (has('actualFloweringDate')) mapped.actual_flowering_date = dt(sd.actualFloweringDate)
  if (has('estimatedHarvestDate')) mapped.estimated_harvest_date = dt(sd.estimatedHarvestDate)
  if (has('predictedYield')) mapped.predicted_yield = num(sd.predictedYield)
  if (has('preLastHarvestDate')) mapped.pre_last_harvest_date = dt(sd.preLastHarvestDate)
  if (has('preTotalTrees')) mapped.pre_total_trees = int(sd.preTotalTrees)
  if (has('preYieldKg')) mapped.pre_yield_kg = num(sd.preYieldKg)
  if (has('preGradeFine')) mapped.pre_grade_fine = num(sd.preGradeFine)
  if (has('preGradePremium')) mapped.pre_grade_premium = num(sd.preGradePremium)
  if (has('preGradeCommercial')) mapped.pre_grade_commercial = num(sd.preGradeCommercial)
  if (has('defectCount')) mapped.defect_count = int(sd.defectCount)
  if (has('beanMoisture')) mapped.bean_moisture = num(sd.beanMoisture)
  if (has('beanSizeMm')) mapped.bean_size_mm = num(sd.beanSizeMm)
  if (has('beanScreenSize')) mapped.bean_screen_size = str(sd.beanScreenSize)
  if (has('defectBlackPct')) mapped.defect_black_pct = num(sd.defectBlackPct)
  if (has('defectMoldInfestedPct')) mapped.defect_mold_infested_pct = num(sd.defectMoldInfestedPct)
  if (has('defectImmaturePct')) mapped.defect_immature_pct = num(sd.defectImmaturePct)
  if (has('defectBrokenPct')) mapped.defect_broken_pct = num(sd.defectBrokenPct)
  if (has('defectDriedCherriesPct')) mapped.defect_dried_cherries_pct = num(sd.defectDriedCherriesPct)
  if (has('defectForeignMatterPct')) mapped.defect_foreign_matter_pct = num(sd.defectForeignMatterPct)
  if (has('pnsTotalDefectsPct')) mapped.pns_total_defects_pct = num(sd.pnsTotalDefectsPct)
  if (has('pnsQualityClass')) mapped.pns_quality_class = str(sd.pnsQualityClass)
  if (has('pnsComplianceStatus')) mapped.pns_compliance_status = str(sd.pnsComplianceStatus)

  // Harvest date fields map to actual_harvest_date.
  if (has('lastHarvestedDate')) mapped.actual_harvest_date = dt(sd.lastHarvestedDate)
  if (has('harvestDate')) mapped.actual_harvest_date = dt(sd.harvestDate)

  // Grade percentages map to "previous_*_pct" columns in current schema.
  if (has('gradeFine')) mapped.previous_fine_pct = num(sd.gradeFine)
  if (has('gradePremium')) mapped.previous_premium_pct = num(sd.gradePremium)
  if (has('gradeCommercial')) mapped.previous_commercial_pct = num(sd.gradeCommercial)

  if (has('previousYield')) mapped.pre_yield_kg = num(sd.previousYield)
  if (has('harvestSeason')) mapped.season = str(sd.harvestSeason)
  if (has('shadeTrees')) mapped.shade_tree_present = normalizeShadeTreeBoolean(sd.shadeTrees)

  return mapped
}

function normalizeShadeTreeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true') return true
  if (normalized === 'no' || normalized === 'false') return false
  return null
}

function toFrequencyEnum(value) {
  if (value === '' || value === null || value === undefined) return null

  const normalized = String(value).trim().toLowerCase()
  if (normalized.startsWith('often')) return 'often'
  if (normalized.startsWith('sometimes')) return 'sometimes'
  if (normalized.startsWith('rarely')) return 'rarely'
  if (normalized.startsWith('never')) return 'never'

  // Unknown values are dropped instead of causing enum write failures.
  return null
}

function fromFrequencyEnum(value) {
  if (value === '' || value === null || value === undefined) return ''

  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'often') return 'Often'
  if (normalized === 'sometimes') return 'Sometimes'
  if (normalized === 'rarely') return 'Rarely'
  if (normalized === 'never') return 'Never'

  return String(value)
}

function toTypeEnum(value) {
  if (value === '' || value === null || value === undefined) return null

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')

  if (normalized === 'organic') return 'organic'
  if (normalized === 'non-organic') return 'non-organic'

  // Unknown values are dropped instead of causing enum write failures.
  return null
}

function fromTypeEnum(value) {
  if (value === '' || value === null || value === undefined) return ''

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')

  if (normalized === 'organic') return 'Organic'
  if (normalized === 'non-organic') return 'Non-Organic'

  return String(value)
}

function mapHarvestRecordFromStageData(sd = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(sd, key)
  const hasRelevantHarvestField =
    has('currentYield') ||
    has('gradeFine') ||
    has('gradePremium') ||
    has('gradeCommercial') ||
    has('harvestDate') ||
    has('lastHarvestedDate') ||
    has('harvestSeason')

  if (!hasRelevantHarvestField) return null

  const parseNum = (value) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  const payload = {
    season: has('harvestSeason') ? (sd.harvestSeason || null) : null,
    actual_harvest_date: has('harvestDate')
      ? (sd.harvestDate || null)
      : has('lastHarvestedDate')
        ? (sd.lastHarvestedDate || null)
        : null,
    yield_kg: has('currentYield') ? parseNum(sd.currentYield) : null,
    grade_fine: has('gradeFine') ? parseNum(sd.gradeFine) : null,
    grade_premium: has('gradePremium') ? parseNum(sd.gradePremium) : null,
    grade_commercial: has('gradeCommercial') ? parseNum(sd.gradeCommercial) : null,
  }

  const hasAnyValue =
    payload.season !== null ||
    payload.actual_harvest_date !== null ||
    payload.yield_kg !== null ||
    payload.grade_fine !== null ||
    payload.grade_premium !== null ||
    payload.grade_commercial !== null

  return hasAnyValue ? payload : null
}

function inferStageSeason(stageData = {}) {
  const explicit = typeof stageData.harvestSeason === 'string' ? stageData.harvestSeason.trim() : ''
  if (explicit) return explicit

  const harvestDate = stageData.harvestDate || stageData.lastHarvestedDate || stageData.estimatedHarvestDate
  if (typeof harvestDate === 'string' && harvestDate.length >= 4) {
    return harvestDate.slice(0, 4)
  }

  return `Season ${new Date().getFullYear()}`
}

function isEmptyValue(value) {
  return value === '' || value === null || value === undefined
}

function normalizeDbError(error, fallbackMessage) {
  const rawMessage = error?.message || fallbackMessage
  if (!rawMessage) return 'Database operation failed.'

  if (rawMessage.includes('violates row-level security policy')) {
    return 'Permission denied by database policy. Please check RLS policies for this table.'
  }

  if (rawMessage.includes('column')) {
    return `Database schema mismatch: ${rawMessage}`
  }

  return rawMessage
}
