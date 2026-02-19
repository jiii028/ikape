-- Keep cluster_stage_data.number_of_plants always synced from clusters.plant_count
-- Run this in Supabase SQL Editor

-- 1) Backfill: ensure every cluster has a stage-data row and overwrite number_of_plants from plant_count
INSERT INTO public.cluster_stage_data (cluster_id, number_of_plants)
SELECT c.id, c.plant_count
FROM public.clusters c
ON CONFLICT (cluster_id)
DO UPDATE SET
  number_of_plants = EXCLUDED.number_of_plants,
  updated_at = now();

-- 2) Trigger function: whenever clusters.plant_count changes, mirror it to cluster_stage_data.number_of_plants
CREATE OR REPLACE FUNCTION public.sync_number_of_plants_from_clusters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.cluster_stage_data (cluster_id, number_of_plants)
  VALUES (NEW.id, NEW.plant_count)
  ON CONFLICT (cluster_id)
  DO UPDATE SET
    number_of_plants = EXCLUDED.number_of_plants,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_number_of_plants_from_clusters ON public.clusters;

CREATE TRIGGER trg_sync_number_of_plants_from_clusters
AFTER INSERT OR UPDATE OF plant_count
ON public.clusters
FOR EACH ROW
EXECUTE FUNCTION public.sync_number_of_plants_from_clusters();

-- 3) Trigger function: overwrite direct edits to cluster_stage_data.number_of_plants with clusters.plant_count
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

-- Optional verification query
-- SELECT c.id, c.plant_count, csd.number_of_plants
-- FROM public.clusters c
-- LEFT JOIN public.cluster_stage_data csd ON csd.cluster_id = c.id
-- ORDER BY c.created_at DESC;
