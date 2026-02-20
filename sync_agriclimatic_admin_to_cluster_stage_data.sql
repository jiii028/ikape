-- Keep cluster_stage_data agriclimatic columns synced from agriclimatic_admin
-- Run this in Supabase SQL Editor

-- Columns synced:
--   cluster_stage_data.soil_ph          <= agriclimatic_admin.soil_ph
--   cluster_stage_data.avg_temp_c       <= agriclimatic_admin.monthly_temperature
--   cluster_stage_data.avg_rainfall_mm  <= agriclimatic_admin.rainfall
--   cluster_stage_data.avg_humidity_pct <= agriclimatic_admin.humidity

-- 0) Keep agriclimatic_admin.updated_at fresh on every update
CREATE OR REPLACE FUNCTION public.touch_agriclimatic_admin_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_agriclimatic_admin_updated_at ON public.agriclimatic_admin;

CREATE TRIGGER trg_touch_agriclimatic_admin_updated_at
BEFORE UPDATE
ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.touch_agriclimatic_admin_updated_at();

-- 1) Helper function: apply latest admin agriclimatic values to ALL existing cluster_stage_data rows
CREATE OR REPLACE FUNCTION public.apply_latest_agriclimatic_to_cluster_stage_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_soil_ph numeric;
  latest_temp numeric;
  latest_rainfall numeric;
  latest_humidity numeric;
BEGIN
  SELECT
    aa.soil_ph,
    aa.monthly_temperature,
    aa.rainfall,
    aa.humidity
  INTO
    latest_soil_ph,
    latest_temp,
    latest_rainfall,
    latest_humidity
  FROM public.agriclimatic_admin aa
  ORDER BY aa.updated_at DESC NULLS LAST, aa.created_at DESC NULLS LAST
  LIMIT 1;

  IF latest_soil_ph IS NULL AND latest_temp IS NULL AND latest_rainfall IS NULL AND latest_humidity IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.cluster_stage_data
  SET
    soil_ph = latest_soil_ph,
    avg_temp_c = latest_temp,
    avg_rainfall_mm = latest_rainfall,
    avg_humidity_pct = latest_humidity,
    updated_at = now()
  WHERE true;
END;
$$;

-- Backfill now: this updates ALL existing rows immediately
SELECT public.apply_latest_agriclimatic_to_cluster_stage_data();

-- Extra forced backfill (same result, independent of function internals)
WITH latest_admin AS (
  SELECT
    aa.soil_ph,
    aa.monthly_temperature,
    aa.rainfall,
    aa.humidity
  FROM public.agriclimatic_admin aa
  ORDER BY aa.updated_at DESC NULLS LAST, aa.created_at DESC NULLS LAST
  LIMIT 1
)
UPDATE public.cluster_stage_data csd
SET
  soil_ph = la.soil_ph,
  avg_temp_c = la.monthly_temperature,
  avg_rainfall_mm = la.rainfall,
  avg_humidity_pct = la.humidity,
  updated_at = now()
FROM latest_admin la
WHERE true;

-- 2) Trigger function: whenever admin agriclimatic inputs change, sync to all cluster_stage_data rows
CREATE OR REPLACE FUNCTION public.sync_agriclimatic_to_cluster_stage_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cluster_stage_data
  SET
    soil_ph = NEW.soil_ph,
    avg_temp_c = NEW.monthly_temperature,
    avg_rainfall_mm = NEW.rainfall,
    avg_humidity_pct = NEW.humidity,
    updated_at = now()
  WHERE true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agriclimatic_to_cluster_stage_data ON public.agriclimatic_admin;

CREATE TRIGGER trg_sync_agriclimatic_to_cluster_stage_data
AFTER INSERT OR UPDATE OF soil_ph, monthly_temperature, rainfall, humidity
ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.sync_agriclimatic_to_cluster_stage_data();

-- 3) Trigger function: enforce synced values on future cluster_stage_data inserts/updates
CREATE OR REPLACE FUNCTION public.enforce_agriclimatic_from_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_soil_ph numeric;
  latest_temp numeric;
  latest_rainfall numeric;
  latest_humidity numeric;
BEGIN
  SELECT
    aa.soil_ph,
    aa.monthly_temperature,
    aa.rainfall,
    aa.humidity
  INTO
    latest_soil_ph,
    latest_temp,
    latest_rainfall,
    latest_humidity
  FROM public.agriclimatic_admin aa
  ORDER BY aa.updated_at DESC NULLS LAST, aa.created_at DESC NULLS LAST
  LIMIT 1;

  IF latest_soil_ph IS NOT NULL OR latest_temp IS NOT NULL OR latest_rainfall IS NOT NULL OR latest_humidity IS NOT NULL THEN
    NEW.soil_ph := latest_soil_ph;
    NEW.avg_temp_c := latest_temp;
    NEW.avg_rainfall_mm := latest_rainfall;
    NEW.avg_humidity_pct := latest_humidity;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_agriclimatic_from_admin ON public.cluster_stage_data;

CREATE TRIGGER trg_enforce_agriclimatic_from_admin
BEFORE INSERT OR UPDATE OF soil_ph, avg_temp_c, avg_rainfall_mm, avg_humidity_pct, cluster_id
ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_agriclimatic_from_admin();

-- Optional verification query
-- SELECT
--   csd.id,
--   csd.cluster_id,
--   csd.soil_ph,
--   csd.avg_temp_c,
--   csd.avg_rainfall_mm,
--   csd.avg_humidity_pct,
--   aa.soil_ph AS admin_soil_ph,
--   aa.monthly_temperature AS admin_temp,
--   aa.rainfall AS admin_rainfall,
--   aa.humidity AS admin_humidity
-- FROM public.cluster_stage_data csd
-- CROSS JOIN LATERAL (
--   SELECT soil_ph, monthly_temperature, rainfall, humidity
--   FROM public.agriclimatic_admin
--   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
--   LIMIT 1
-- ) aa
-- ORDER BY csd.updated_at DESC
-- LIMIT 100;
