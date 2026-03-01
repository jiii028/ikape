-- Audit trail + append-only safeguards for non-destructive data handling.
-- Run in Supabase SQL editor after schema alignment scripts.

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_data_change_audit_log_table_time
  ON public.data_change_audit_log (table_name, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_change_audit_log_row_id
  ON public.data_change_audit_log (row_id);

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

CREATE OR REPLACE FUNCTION public.enforce_append_only_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Controlled override for DBA maintenance sessions:
  -- SET LOCAL app.bypass_append_only = 'on';
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

COMMIT;
