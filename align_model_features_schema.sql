-- Model-centric schema alignment for prediction quality.
-- Includes requested factors: flood/weather, plant age (years), farm/cluster IDs,
-- farm size/elevation, soil pH, bean screen size, and defect-related fields.
-- Run in Supabase SQL editor after `align_pns_and_history.sql`.

BEGIN;

ALTER TABLE public.cluster_stage_data
  ADD COLUMN IF NOT EXISTS flood_risk_level text,
  ADD COLUMN IF NOT EXISTS flood_events_count integer,
  ADD COLUMN IF NOT EXISTS flood_last_event_date date,
  ADD COLUMN IF NOT EXISTS bean_size_mm numeric,
  ADD COLUMN IF NOT EXISTS bean_screen_size text,
  ADD COLUMN IF NOT EXISTS bean_moisture numeric,
  ADD COLUMN IF NOT EXISTS defect_black_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_mold_infested_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_immature_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_broken_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_dried_cherries_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_foreign_matter_pct numeric,
  ADD COLUMN IF NOT EXISTS pns_total_defects_pct numeric;

-- Add constraints as NOT VALID to avoid migration failure from legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_flood_risk_level'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_flood_risk_level
      CHECK (
        flood_risk_level IS NULL OR
        flood_risk_level IN ('none', 'low', 'medium', 'high', 'severe')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_soil_ph_range'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_soil_ph_range
      CHECK (soil_ph IS NULL OR (soil_ph >= 0 AND soil_ph <= 14)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_bean_moisture_range'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_bean_moisture_range
      CHECK (bean_moisture IS NULL OR (bean_moisture >= 0 AND bean_moisture <= 100)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_defects_range'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_defects_range
      CHECK (
        (defect_black_pct IS NULL OR (defect_black_pct >= 0 AND defect_black_pct <= 100)) AND
        (defect_mold_infested_pct IS NULL OR (defect_mold_infested_pct >= 0 AND defect_mold_infested_pct <= 100)) AND
        (defect_immature_pct IS NULL OR (defect_immature_pct >= 0 AND defect_immature_pct <= 100)) AND
        (defect_broken_pct IS NULL OR (defect_broken_pct >= 0 AND defect_broken_pct <= 100)) AND
        (defect_dried_cherries_pct IS NULL OR (defect_dried_cherries_pct >= 0 AND defect_dried_cherries_pct <= 100)) AND
        (defect_foreign_matter_pct IS NULL OR (defect_foreign_matter_pct >= 0 AND defect_foreign_matter_pct <= 100)) AND
        (pns_total_defects_pct IS NULL OR (pns_total_defects_pct >= 0 AND pns_total_defects_pct <= 100))
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clusters_farm_id
  ON public.clusters (farm_id);

CREATE INDEX IF NOT EXISTS idx_cluster_stage_data_cluster_updated
  ON public.cluster_stage_data (cluster_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_records_cluster_recorded
  ON public.harvest_records (cluster_id, recorded_at DESC);

-- Latest model-ready feature view (explicitly excludes cupping score).
CREATE OR REPLACE VIEW public.model_features_latest AS
WITH latest_stage AS (
  SELECT DISTINCT ON (csd.cluster_id)
    csd.*
  FROM public.cluster_stage_data csd
  ORDER BY csd.cluster_id, csd.updated_at DESC NULLS LAST, csd.created_at DESC NULLS LAST
),
latest_harvest AS (
  SELECT DISTINCT ON (hr.cluster_id)
    hr.cluster_id,
    hr.yield_kg,
    hr.grade_fine,
    hr.grade_premium,
    hr.grade_commercial,
    hr.recorded_at
  FROM public.harvest_records hr
  ORDER BY hr.cluster_id, hr.recorded_at DESC NULLS LAST
),
farm_cluster_stats AS (
  SELECT
    c.farm_id,
    COUNT(*)::integer AS farm_cluster_count,
    SUM(COALESCE(c.plant_count, 0))::numeric AS farm_total_plants
  FROM public.clusters c
  GROUP BY c.farm_id
)
SELECT
  c.farm_id,
  c.id AS cluster_id,
  f.farm_area AS farm_size_ha,
  f.elevation_m,
  fcs.farm_cluster_count,
  CASE
    WHEN COALESCE(f.overall_tree_count::numeric, fcs.farm_total_plants) > 0
      THEN (COALESCE(ls.number_of_plants::numeric, c.plant_count::numeric) /
            COALESCE(f.overall_tree_count::numeric, fcs.farm_total_plants)) * 100
    ELSE NULL
  END AS cluster_plant_share_pct,
  CASE
    WHEN c.area_size_sqm > 0
      THEN COALESCE(ls.number_of_plants::numeric, c.plant_count::numeric) / c.area_size_sqm
    ELSE NULL
  END AS cluster_tree_density_per_sqm,
  CASE
    WHEN ls.date_planted IS NOT NULL
      THEN GREATEST(EXTRACT(EPOCH FROM (now() - ls.date_planted::timestamp)) / 31556952.0, 0)
    ELSE NULL
  END AS plant_age_years,
  COALESCE(ls.number_of_plants, c.plant_count) AS number_of_plants,
  ls.fertilizer_type,
  ls.fertilizer_frequency,
  ls.pesticide_type,
  ls.pesticide_frequency,
  CASE
    WHEN ls.last_pruned_date IS NOT NULL
      THEN GREATEST(EXTRACT(EPOCH FROM (now() - ls.last_pruned_date::timestamp)) / 2629746.0, 0)
    ELSE NULL
  END AS pruning_interval_months,
  CASE
    WHEN ls.shade_tree_present IS TRUE THEN 'yes'
    WHEN ls.shade_tree_present IS FALSE THEN 'no'
    ELSE NULL
  END AS shade_tree_present,
  ls.soil_ph,
  ls.avg_temp_c,
  ls.avg_rainfall_mm,
  ls.avg_humidity_pct,
  ls.flood_risk_level,
  ls.flood_events_count,
  ls.pre_total_trees,
  ls.pre_yield_kg,
  ls.pre_grade_fine,
  ls.pre_grade_premium,
  ls.pre_grade_commercial,
  ls.previous_fine_pct,
  ls.previous_premium_pct,
  ls.previous_commercial_pct,
  ls.bean_size_mm,
  ls.bean_screen_size,
  ls.bean_moisture,
  ls.defect_black_pct,
  ls.defect_mold_infested_pct,
  ls.defect_immature_pct,
  ls.defect_broken_pct,
  ls.defect_dried_cherries_pct,
  ls.defect_foreign_matter_pct,
  ls.pns_total_defects_pct,
  COALESCE(ls.post_current_yield, ls.current_yield, lh.yield_kg) AS yield_kg,
  COALESCE(ls.post_grade_fine, ls.previous_fine_pct, lh.grade_fine) AS fine_grade_pct,
  COALESCE(ls.post_grade_premium, ls.previous_premium_pct, lh.grade_premium) AS premium_grade_pct,
  COALESCE(ls.post_grade_commercial, ls.previous_commercial_pct, lh.grade_commercial) AS commercial_grade_pct
FROM public.clusters c
JOIN public.farms f ON f.id = c.farm_id
LEFT JOIN latest_stage ls ON ls.cluster_id = c.id
LEFT JOIN latest_harvest lh ON lh.cluster_id = c.id
LEFT JOIN farm_cluster_stats fcs ON fcs.farm_id = c.farm_id;

COMMIT;
