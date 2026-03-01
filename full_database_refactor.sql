-- Full database refactor for IKAPE
-- Supersedes:
--   - fix_rls_policies.sql
--   - align_pns_and_history.sql
--   - align_model_features_schema.sql
--   - sync_plant_count_to_stage_data.sql
--   - add_audit_and_append_only_safeguards.sql
--
-- Safe to run multiple times (idempotent where possible).
-- Run in Supabase SQL editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Core tables (create if missing)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  username text,
  email text,
  password_hash text,
  first_name text,
  last_name text,
  middle_initial text,
  contact_number text,
  age integer,
  municipality text,
  province text,
  role text DEFAULT 'farmer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  farm_name text,
  farm_area numeric,
  elevation_m numeric,
  overall_tree_count integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  cluster_name text,
  area_size_sqm numeric,
  plant_count integer,
  plant_stage text DEFAULT 'seed-sapling',
  variety text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cluster_stage_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL,
  season text,
  date_planted date,
  number_of_plants integer,
  fertilizer_type text,
  fertilizer_frequency text,
  pesticide_type text,
  pesticide_frequency text,
  last_pruned_date date,
  soil_ph numeric,
  avg_temp_c numeric,
  avg_rainfall_mm numeric,
  avg_humidity_pct numeric,
  flood_risk_level text,
  flood_events_count integer,
  flood_last_event_date date,
  estimated_flowering_date date,
  actual_flowering_date date,
  estimated_harvest_date date,
  actual_harvest_date date,
  predicted_yield numeric,
  current_yield numeric,
  pre_last_harvest_date date,
  pre_total_trees integer,
  pre_yield_kg numeric,
  pre_grade_fine numeric,
  pre_grade_premium numeric,
  pre_grade_commercial numeric,
  previous_fine_pct numeric,
  previous_premium_pct numeric,
  previous_commercial_pct numeric,
  post_current_yield numeric,
  post_grade_fine numeric,
  post_grade_premium numeric,
  post_grade_commercial numeric,
  shade_tree_present boolean,
  defect_count integer,
  bean_size_mm numeric,
  bean_screen_size text,
  bean_moisture numeric,
  defect_black_pct numeric,
  defect_mold_infested_pct numeric,
  defect_immature_pct numeric,
  defect_broken_pct numeric,
  defect_dried_cherries_pct numeric,
  defect_foreign_matter_pct numeric,
  pns_total_defects_pct numeric,
  pns_quality_class text,
  pns_compliance_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.harvest_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL,
  season text,
  actual_harvest_date date,
  yield_kg numeric,
  grade_fine numeric,
  grade_premium numeric,
  grade_commercial numeric,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agriclimatic_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_temperature numeric,
  rainfall numeric,
  humidity numeric,
  soil_ph numeric,
  flood_risk_level text DEFAULT 'none',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2) Legacy column normalization
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'farms' AND column_name = 'elevation'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'farms' AND column_name = 'elevation_m'
  ) THEN
    EXECUTE 'ALTER TABLE public.farms RENAME COLUMN elevation TO elevation_m';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clusters' AND column_name = 'area_size'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clusters' AND column_name = 'area_size_sqm'
  ) THEN
    EXECUTE 'ALTER TABLE public.clusters RENAME COLUMN area_size TO area_size_sqm';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Add missing columns used by frontend/backend
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS middle_initial text,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'farmer',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS farm_name text,
  ADD COLUMN IF NOT EXISTS farm_area numeric,
  ADD COLUMN IF NOT EXISTS elevation_m numeric,
  ADD COLUMN IF NOT EXISTS overall_tree_count integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.clusters
  ADD COLUMN IF NOT EXISTS cluster_name text,
  ADD COLUMN IF NOT EXISTS area_size_sqm numeric,
  ADD COLUMN IF NOT EXISTS plant_count integer,
  ADD COLUMN IF NOT EXISTS plant_stage text DEFAULT 'seed-sapling',
  ADD COLUMN IF NOT EXISTS variety text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.cluster_stage_data
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS date_planted date,
  ADD COLUMN IF NOT EXISTS number_of_plants integer,
  ADD COLUMN IF NOT EXISTS fertilizer_type text,
  ADD COLUMN IF NOT EXISTS fertilizer_frequency text,
  ADD COLUMN IF NOT EXISTS pesticide_type text,
  ADD COLUMN IF NOT EXISTS pesticide_frequency text,
  ADD COLUMN IF NOT EXISTS last_pruned_date date,
  ADD COLUMN IF NOT EXISTS soil_ph numeric,
  ADD COLUMN IF NOT EXISTS avg_temp_c numeric,
  ADD COLUMN IF NOT EXISTS avg_rainfall_mm numeric,
  ADD COLUMN IF NOT EXISTS avg_humidity_pct numeric,
  ADD COLUMN IF NOT EXISTS flood_risk_level text,
  ADD COLUMN IF NOT EXISTS flood_events_count integer,
  ADD COLUMN IF NOT EXISTS flood_last_event_date date,
  ADD COLUMN IF NOT EXISTS estimated_flowering_date date,
  ADD COLUMN IF NOT EXISTS actual_flowering_date date,
  ADD COLUMN IF NOT EXISTS estimated_harvest_date date,
  ADD COLUMN IF NOT EXISTS actual_harvest_date date,
  ADD COLUMN IF NOT EXISTS predicted_yield numeric,
  ADD COLUMN IF NOT EXISTS current_yield numeric,
  ADD COLUMN IF NOT EXISTS pre_last_harvest_date date,
  ADD COLUMN IF NOT EXISTS pre_total_trees integer,
  ADD COLUMN IF NOT EXISTS pre_yield_kg numeric,
  ADD COLUMN IF NOT EXISTS pre_grade_fine numeric,
  ADD COLUMN IF NOT EXISTS pre_grade_premium numeric,
  ADD COLUMN IF NOT EXISTS pre_grade_commercial numeric,
  ADD COLUMN IF NOT EXISTS previous_fine_pct numeric,
  ADD COLUMN IF NOT EXISTS previous_premium_pct numeric,
  ADD COLUMN IF NOT EXISTS previous_commercial_pct numeric,
  ADD COLUMN IF NOT EXISTS post_current_yield numeric,
  ADD COLUMN IF NOT EXISTS post_grade_fine numeric,
  ADD COLUMN IF NOT EXISTS post_grade_premium numeric,
  ADD COLUMN IF NOT EXISTS post_grade_commercial numeric,
  ADD COLUMN IF NOT EXISTS shade_tree_present boolean,
  ADD COLUMN IF NOT EXISTS defect_count integer,
  ADD COLUMN IF NOT EXISTS bean_size_mm numeric,
  ADD COLUMN IF NOT EXISTS bean_screen_size text,
  ADD COLUMN IF NOT EXISTS bean_moisture numeric,
  ADD COLUMN IF NOT EXISTS defect_black_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_mold_infested_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_immature_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_broken_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_dried_cherries_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_foreign_matter_pct numeric,
  ADD COLUMN IF NOT EXISTS pns_total_defects_pct numeric,
  ADD COLUMN IF NOT EXISTS pns_quality_class text,
  ADD COLUMN IF NOT EXISTS pns_compliance_status text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.harvest_records
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS actual_harvest_date date,
  ADD COLUMN IF NOT EXISTS yield_kg numeric,
  ADD COLUMN IF NOT EXISTS grade_fine numeric,
  ADD COLUMN IF NOT EXISTS grade_premium numeric,
  ADD COLUMN IF NOT EXISTS grade_commercial numeric,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.agriclimatic_admin
  ADD COLUMN IF NOT EXISTS monthly_temperature numeric,
  ADD COLUMN IF NOT EXISTS rainfall numeric,
  ADD COLUMN IF NOT EXISTS humidity numeric,
  ADD COLUMN IF NOT EXISTS soil_ph numeric,
  ADD COLUMN IF NOT EXISTS flood_risk_level text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- ---------------------------------------------------------------------------
-- 4) Foreign keys and relational constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_farms_user_id'
  ) THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT fk_farms_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_clusters_farm_id'
  ) THEN
    ALTER TABLE public.clusters
      ADD CONSTRAINT fk_clusters_farm_id
      FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cluster_stage_data_cluster_id'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT fk_cluster_stage_data_cluster_id
      FOREIGN KEY (cluster_id) REFERENCES public.clusters(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_harvest_records_cluster_id'
  ) THEN
    ALTER TABLE public.harvest_records
      ADD CONSTRAINT fk_harvest_records_cluster_id
      FOREIGN KEY (cluster_id) REFERENCES public.clusters(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_agriclimatic_admin_created_by'
  ) THEN
    ALTER TABLE public.agriclimatic_admin
      ADD CONSTRAINT fk_agriclimatic_admin_created_by
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Remove one-row-per-cluster history blocker if present.
ALTER TABLE public.cluster_stage_data
  DROP CONSTRAINT IF EXISTS cluster_stage_data_cluster_id_key;
DROP INDEX IF EXISTS public.cluster_stage_data_cluster_id_key;

-- ---------------------------------------------------------------------------
-- 5) Data quality constraints (NOT VALID for legacy compatibility)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_role
      CHECK (role IS NULL OR role IN ('farmer', 'admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_farms_positive_values'
  ) THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT chk_farms_positive_values
      CHECK (
        (farm_area IS NULL OR farm_area > 0) AND
        (elevation_m IS NULL OR (elevation_m >= 0 AND elevation_m <= 3000)) AND
        (overall_tree_count IS NULL OR overall_tree_count >= 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clusters_positive_values'
  ) THEN
    ALTER TABLE public.clusters
      ADD CONSTRAINT chk_clusters_positive_values
      CHECK (
        (area_size_sqm IS NULL OR area_size_sqm > 0) AND
        (plant_count IS NULL OR plant_count >= 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clusters_stage_values'
  ) THEN
    ALTER TABLE public.clusters
      ADD CONSTRAINT chk_clusters_stage_values
      CHECK (
        plant_stage IS NULL OR
        plant_stage IN ('seed-sapling', 'tree', 'flowering', 'fruit-bearing', 'ready-to-harvest')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_type_frequency_values'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_type_frequency_values
      CHECK (
        (fertilizer_type IS NULL OR fertilizer_type IN ('organic', 'non-organic')) AND
        (pesticide_type IS NULL OR pesticide_type IN ('organic', 'non-organic')) AND
        (fertilizer_frequency IS NULL OR fertilizer_frequency IN ('never', 'rarely', 'sometimes', 'often')) AND
        (pesticide_frequency IS NULL OR pesticide_frequency IN ('never', 'rarely', 'sometimes', 'often'))
      ) NOT VALID;
  END IF;

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
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_csd_numeric_ranges'
  ) THEN
    ALTER TABLE public.cluster_stage_data
      ADD CONSTRAINT chk_csd_numeric_ranges
      CHECK (
        (soil_ph IS NULL OR (soil_ph >= 0 AND soil_ph <= 14)) AND
        (avg_humidity_pct IS NULL OR (avg_humidity_pct >= 0 AND avg_humidity_pct <= 100)) AND
        (bean_moisture IS NULL OR (bean_moisture >= 0 AND bean_moisture <= 100)) AND
        (defect_black_pct IS NULL OR (defect_black_pct >= 0 AND defect_black_pct <= 100)) AND
        (defect_mold_infested_pct IS NULL OR (defect_mold_infested_pct >= 0 AND defect_mold_infested_pct <= 100)) AND
        (defect_immature_pct IS NULL OR (defect_immature_pct >= 0 AND defect_immature_pct <= 100)) AND
        (defect_broken_pct IS NULL OR (defect_broken_pct >= 0 AND defect_broken_pct <= 100)) AND
        (defect_dried_cherries_pct IS NULL OR (defect_dried_cherries_pct >= 0 AND defect_dried_cherries_pct <= 100)) AND
        (defect_foreign_matter_pct IS NULL OR (defect_foreign_matter_pct >= 0 AND defect_foreign_matter_pct <= 100)) AND
        (pns_total_defects_pct IS NULL OR (pns_total_defects_pct >= 0 AND pns_total_defects_pct <= 100))
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_harvest_ranges'
  ) THEN
    ALTER TABLE public.harvest_records
      ADD CONSTRAINT chk_harvest_ranges
      CHECK (
        (yield_kg IS NULL OR yield_kg >= 0) AND
        (grade_fine IS NULL OR (grade_fine >= 0 AND grade_fine <= 100)) AND
        (grade_premium IS NULL OR (grade_premium >= 0 AND grade_premium <= 100)) AND
        (grade_commercial IS NULL OR (grade_commercial >= 0 AND grade_commercial <= 100))
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agriclimatic_ranges'
  ) THEN
    ALTER TABLE public.agriclimatic_admin
      ADD CONSTRAINT chk_agriclimatic_ranges
      CHECK (
        (rainfall IS NULL OR rainfall >= 0) AND
        (humidity IS NULL OR (humidity >= 0 AND humidity <= 100)) AND
        (soil_ph IS NULL OR (soil_ph >= 0 AND soil_ph <= 14))
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agriclimatic_flood_risk'
  ) THEN
    ALTER TABLE public.agriclimatic_admin
      ADD CONSTRAINT chk_agriclimatic_flood_risk
      CHECK (
        flood_risk_level IS NULL OR
        flood_risk_level IN ('none', 'low', 'medium', 'high', 'severe')
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Standard updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_users_updated_at ON public.users;
CREATE TRIGGER trg_touch_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_farms_updated_at ON public.farms;
CREATE TRIGGER trg_touch_farms_updated_at
BEFORE UPDATE ON public.farms
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_clusters_updated_at ON public.clusters;
CREATE TRIGGER trg_touch_clusters_updated_at
BEFORE UPDATE ON public.clusters
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_cluster_stage_data_updated_at ON public.cluster_stage_data;
CREATE TRIGGER trg_touch_cluster_stage_data_updated_at
BEFORE UPDATE ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_harvest_records_updated_at ON public.harvest_records;
CREATE TRIGGER trg_touch_harvest_records_updated_at
BEFORE UPDATE ON public.harvest_records
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_agriclimatic_admin_updated_at ON public.agriclimatic_admin;
CREATE TRIGGER trg_touch_agriclimatic_admin_updated_at
BEFORE UPDATE ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
-- ---------------------------------------------------------------------------
-- 7) Stage/harvest normalization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_stage_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fertilizer_type IS NOT NULL THEN
    NEW.fertilizer_type := lower(replace(replace(trim(NEW.fertilizer_type), '_', '-'), ' ', '-'));
    IF NEW.fertilizer_type = 'nonorganic' THEN NEW.fertilizer_type := 'non-organic'; END IF;
  END IF;

  IF NEW.pesticide_type IS NOT NULL THEN
    NEW.pesticide_type := lower(replace(replace(trim(NEW.pesticide_type), '_', '-'), ' ', '-'));
    IF NEW.pesticide_type = 'nonorganic' THEN NEW.pesticide_type := 'non-organic'; END IF;
  END IF;

  IF NEW.fertilizer_frequency IS NOT NULL THEN
    NEW.fertilizer_frequency := lower(trim(NEW.fertilizer_frequency));
  END IF;

  IF NEW.pesticide_frequency IS NOT NULL THEN
    NEW.pesticide_frequency := lower(trim(NEW.pesticide_frequency));
  END IF;

  IF NEW.flood_risk_level IS NOT NULL THEN
    NEW.flood_risk_level := lower(replace(replace(trim(NEW.flood_risk_level), '_', '-'), ' ', '-'));
  END IF;

  IF NEW.bean_screen_size IS NOT NULL THEN
    NEW.bean_screen_size := lower(replace(replace(trim(NEW.bean_screen_size), '_', '-'), ' ', '-'));
  END IF;

  IF NEW.pns_total_defects_pct IS NULL THEN
    NEW.pns_total_defects_pct :=
      COALESCE(NEW.defect_black_pct, 0) +
      COALESCE(NEW.defect_mold_infested_pct, 0) +
      COALESCE(NEW.defect_immature_pct, 0) +
      COALESCE(NEW.defect_broken_pct, 0) +
      COALESCE(NEW.defect_dried_cherries_pct, 0) +
      COALESCE(NEW.defect_foreign_matter_pct, 0);
  END IF;

  IF NEW.pns_total_defects_pct IS NOT NULL THEN
    NEW.pns_total_defects_pct := LEAST(GREATEST(NEW.pns_total_defects_pct, 0), 100);
  END IF;

  IF NEW.season IS NULL THEN
    NEW.season := concat('Season ', extract(year FROM now())::int);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_stage_snapshot ON public.cluster_stage_data;
CREATE TRIGGER trg_normalize_stage_snapshot
BEFORE INSERT OR UPDATE ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.normalize_stage_snapshot();

-- ---------------------------------------------------------------------------
-- 8) Plant-count synchronization without destructive updates
-- ---------------------------------------------------------------------------

INSERT INTO public.cluster_stage_data (cluster_id, number_of_plants, season)
SELECT
  c.id,
  c.plant_count,
  concat('Season ', extract(year from now())::int)
FROM public.clusters c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cluster_stage_data csd
  WHERE csd.cluster_id = c.id
);

CREATE OR REPLACE FUNCTION public.sync_number_of_plants_from_clusters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.plant_count IS DISTINCT FROM OLD.plant_count THEN
    INSERT INTO public.cluster_stage_data (cluster_id, number_of_plants, season)
    VALUES (
      NEW.id,
      NEW.plant_count,
      concat('Season ', extract(year from now())::int)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_number_of_plants_from_clusters ON public.clusters;
CREATE TRIGGER trg_sync_number_of_plants_from_clusters
AFTER INSERT OR UPDATE OF plant_count
ON public.clusters
FOR EACH ROW
EXECUTE FUNCTION public.sync_number_of_plants_from_clusters();

CREATE OR REPLACE FUNCTION public.enforce_number_of_plants_from_clusters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_plant_count integer;
BEGIN
  SELECT c.plant_count
  INTO source_plant_count
  FROM public.clusters c
  WHERE c.id = NEW.cluster_id;

  IF source_plant_count IS NOT NULL THEN
    NEW.number_of_plants := source_plant_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_number_of_plants_from_clusters ON public.cluster_stage_data;
CREATE TRIGGER trg_enforce_number_of_plants_from_clusters
BEFORE INSERT OR UPDATE OF number_of_plants, cluster_id
ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_number_of_plants_from_clusters();

-- ---------------------------------------------------------------------------
-- 9) Append-only history + audit logging
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.data_change_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  row_id text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_payload jsonb;
  resolved_row_id text;
  actor_id uuid;
BEGIN
  actor_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    source_payload := to_jsonb(NEW);
  ELSE
    source_payload := to_jsonb(OLD);
  END IF;

  resolved_row_id := COALESCE(
    source_payload->>'id',
    source_payload->>'cluster_id',
    source_payload->>'farm_id',
    source_payload->>'user_id'
  );

  INSERT INTO public.data_change_audit_log (
    table_name,
    operation,
    row_id,
    old_data,
    new_data,
    changed_by
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    resolved_row_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    actor_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_farms ON public.farms;
CREATE TRIGGER trg_audit_farms
AFTER INSERT OR UPDATE OR DELETE
ON public.farms
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_clusters ON public.clusters;
CREATE TRIGGER trg_audit_clusters
AFTER INSERT OR UPDATE OR DELETE
ON public.clusters
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_cluster_stage_data ON public.cluster_stage_data;
CREATE TRIGGER trg_audit_cluster_stage_data
AFTER INSERT OR UPDATE OR DELETE
ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_harvest_records ON public.harvest_records;
CREATE TRIGGER trg_audit_harvest_records
AFTER INSERT OR UPDATE OR DELETE
ON public.harvest_records
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_agriclimatic_admin ON public.agriclimatic_admin;
CREATE TRIGGER trg_audit_agriclimatic_admin
AFTER INSERT OR UPDATE OR DELETE
ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_changes();

CREATE OR REPLACE FUNCTION public.enforce_append_only_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Controlled bypass for maintenance:
  --   BEGIN;
  --   SET LOCAL app.bypass_append_only = 'on';
  --   ...maintenance DML...
  --   COMMIT;
  IF current_setting('app.bypass_append_only', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION '% is append-only. Insert a new snapshot instead of %.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cluster_stage_data_mutation ON public.cluster_stage_data;
CREATE TRIGGER trg_prevent_cluster_stage_data_mutation
BEFORE UPDATE OR DELETE
ON public.cluster_stage_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_append_only_records();

DROP TRIGGER IF EXISTS trg_prevent_harvest_records_mutation ON public.harvest_records;
CREATE TRIGGER trg_prevent_harvest_records_mutation
BEFORE UPDATE OR DELETE
ON public.harvest_records
FOR EACH ROW
EXECUTE FUNCTION public.enforce_append_only_records();

DROP TRIGGER IF EXISTS trg_prevent_agriclimatic_admin_mutation ON public.agriclimatic_admin;
CREATE TRIGGER trg_prevent_agriclimatic_admin_mutation
BEFORE UPDATE OR DELETE
ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.enforce_append_only_records();
-- ---------------------------------------------------------------------------
-- 10) Model-ready view (excludes cupping score by design)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 11) Indexing
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

CREATE INDEX IF NOT EXISTS idx_farms_user_id ON public.farms(user_id);
CREATE INDEX IF NOT EXISTS idx_farms_created_at ON public.farms(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clusters_farm_id ON public.clusters(farm_id);
CREATE INDEX IF NOT EXISTS idx_clusters_stage ON public.clusters(plant_stage);
CREATE INDEX IF NOT EXISTS idx_clusters_created_at ON public.clusters(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cluster_stage_data_cluster_updated
  ON public.cluster_stage_data (cluster_id, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_stage_data_created_at
  ON public.cluster_stage_data (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_records_cluster_recorded
  ON public.harvest_records (cluster_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_records_recorded_at
  ON public.harvest_records (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_agriclimatic_admin_created_at
  ON public.agriclimatic_admin (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_change_audit_log_table_time
  ON public.data_change_audit_log (table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_change_audit_log_row_id
  ON public.data_change_audit_log (row_id);

-- ---------------------------------------------------------------------------
-- 12) RLS hardening aligned with current app behavior
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  );
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_stage_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agriclimatic_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_change_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'users',
        'farms',
        'clusters',
        'cluster_stage_data',
        'harvest_records',
        'agriclimatic_admin',
        'data_change_audit_log'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;
END $$;

-- users
CREATE POLICY users_select_policy
  ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.current_user_is_admin()
    OR auth.role() = 'anon'
  );

CREATE POLICY users_insert_policy
  ON public.users
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    OR public.current_user_is_admin()
  );

CREATE POLICY users_update_policy
  ON public.users
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.current_user_is_admin()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.current_user_is_admin()
  );

CREATE POLICY users_delete_policy
  ON public.users
  FOR DELETE
  USING (public.current_user_is_admin());

-- farms
CREATE POLICY farms_select_policy
  ON public.farms
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.current_user_is_admin()
  );

CREATE POLICY farms_insert_policy
  ON public.farms
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_is_admin()
  );

CREATE POLICY farms_update_policy
  ON public.farms
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.current_user_is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_is_admin()
  );

CREATE POLICY farms_delete_policy
  ON public.farms
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.current_user_is_admin()
  );

-- clusters
CREATE POLICY clusters_select_policy
  ON public.clusters
  FOR SELECT
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = clusters.farm_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY clusters_insert_policy
  ON public.clusters
  FOR INSERT
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = clusters.farm_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY clusters_update_policy
  ON public.clusters
  FOR UPDATE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = clusters.farm_id
        AND f.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = clusters.farm_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY clusters_delete_policy
  ON public.clusters
  FOR DELETE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = clusters.farm_id
        AND f.user_id = auth.uid()
    )
  );

-- cluster_stage_data
CREATE POLICY cluster_stage_data_select_policy
  ON public.cluster_stage_data
  FOR SELECT
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = cluster_stage_data.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY cluster_stage_data_insert_policy
  ON public.cluster_stage_data
  FOR INSERT
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = cluster_stage_data.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY cluster_stage_data_update_policy
  ON public.cluster_stage_data
  FOR UPDATE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = cluster_stage_data.cluster_id
        AND f.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = cluster_stage_data.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY cluster_stage_data_delete_policy
  ON public.cluster_stage_data
  FOR DELETE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = cluster_stage_data.cluster_id
        AND f.user_id = auth.uid()
    )
  );

-- harvest_records
CREATE POLICY harvest_records_select_policy
  ON public.harvest_records
  FOR SELECT
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = harvest_records.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY harvest_records_insert_policy
  ON public.harvest_records
  FOR INSERT
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = harvest_records.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY harvest_records_update_policy
  ON public.harvest_records
  FOR UPDATE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = harvest_records.cluster_id
        AND f.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = harvest_records.cluster_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY harvest_records_delete_policy
  ON public.harvest_records
  FOR DELETE
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clusters c
      JOIN public.farms f ON f.id = c.farm_id
      WHERE c.id = harvest_records.cluster_id
        AND f.user_id = auth.uid()
    )
  );

-- agriclimatic_admin (append-only snapshots)
CREATE POLICY agriclimatic_admin_select_policy
  ON public.agriclimatic_admin
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR public.current_user_is_admin()
  );

CREATE POLICY agriclimatic_admin_insert_policy
  ON public.agriclimatic_admin
  FOR INSERT
  WITH CHECK (
    public.current_user_is_admin()
  );

-- audit log (read-only for admins)
CREATE POLICY data_change_audit_log_select_policy
  ON public.data_change_audit_log
  FOR SELECT
  USING (public.current_user_is_admin());

COMMIT;
