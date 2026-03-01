-- PNS/BAFS 01:2025 alignment + non-overwriting history support
-- Run in Supabase SQL editor.

BEGIN;

-- 1) Allow stage-data history (append-only snapshots).
-- Some schemas enforce one row per cluster via unique(cluster_id).
ALTER TABLE public.cluster_stage_data
  DROP CONSTRAINT IF EXISTS cluster_stage_data_cluster_id_key;

DROP INDEX IF EXISTS public.cluster_stage_data_cluster_id_key;

-- 2) Add PNS-related columns used by the app.
ALTER TABLE public.cluster_stage_data
  ADD COLUMN IF NOT EXISTS bean_size_mm numeric,
  ADD COLUMN IF NOT EXISTS defect_black_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_mold_infested_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_immature_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_broken_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_dried_cherries_pct numeric,
  ADD COLUMN IF NOT EXISTS defect_foreign_matter_pct numeric,
  ADD COLUMN IF NOT EXISTS pns_total_defects_pct numeric,
  ADD COLUMN IF NOT EXISTS pns_quality_class text,
  ADD COLUMN IF NOT EXISTS pns_compliance_status text;

-- 3) Helpful indexes for latest-record fetches.
CREATE INDEX IF NOT EXISTS idx_cluster_stage_data_cluster_updated
  ON public.cluster_stage_data (cluster_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_records_cluster_recorded
  ON public.harvest_records (cluster_id, recorded_at DESC);

COMMIT;
