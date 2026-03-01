-- Keep cluster_stage_data.number_of_plants synced from clusters.plant_count
-- Compatible with append-only stage history (no ON CONFLICT dependency).
-- Run this in Supabase SQL Editor.

BEGIN;

-- 1) Backfill only missing clusters (do not overwrite existing history).
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

-- 2) Trigger: append a new stage snapshot whenever clusters.plant_count changes.
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

-- 3) Trigger: enforce source-of-truth from clusters on direct stage_data edits.
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

COMMIT;
