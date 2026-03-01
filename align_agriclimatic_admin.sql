-- Align missing admin weather input source used by farmer Cluster Detail overview.
-- Adds append-only agriclimatic snapshots so edits never overwrite historical rows.
-- Run this in Supabase SQL Editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agriclimatic_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_temperature numeric NOT NULL,
  rainfall numeric NOT NULL,
  humidity numeric NOT NULL,
  soil_ph numeric NOT NULL,
  flood_risk_level text DEFAULT 'none',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agri_ranges'
  ) THEN
    ALTER TABLE public.agriclimatic_admin
      ADD CONSTRAINT chk_agri_ranges
      CHECK (
        rainfall >= 0 AND
        humidity >= 0 AND humidity <= 100 AND
        soil_ph >= 0 AND soil_ph <= 14
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agri_flood_risk'
  ) THEN
    ALTER TABLE public.agriclimatic_admin
      ADD CONSTRAINT chk_agri_flood_risk
      CHECK (
        flood_risk_level IS NULL OR
        flood_risk_level IN ('none', 'low', 'medium', 'high', 'severe')
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agriclimatic_admin_created_at
  ON public.agriclimatic_admin (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_agriclimatic_admin_updated_at ON public.agriclimatic_admin;
CREATE TRIGGER trg_touch_agriclimatic_admin_updated_at
BEFORE UPDATE ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- Keep table append-only to preserve historical weather snapshots.
CREATE OR REPLACE FUNCTION public.enforce_append_only_agriclimatic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agriclimatic_admin is append-only. Insert a new snapshot instead of %.', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_agriclimatic_admin_mutation ON public.agriclimatic_admin;
CREATE TRIGGER trg_prevent_agriclimatic_admin_mutation
BEFORE UPDATE OR DELETE
ON public.agriclimatic_admin
FOR EACH ROW
EXECUTE FUNCTION public.enforce_append_only_agriclimatic();

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

ALTER TABLE public.agriclimatic_admin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agriclimatic_admin_select_policy ON public.agriclimatic_admin;
DROP POLICY IF EXISTS agriclimatic_admin_insert_policy ON public.agriclimatic_admin;

-- Farmers and admins can read latest weather baseline.
CREATE POLICY agriclimatic_admin_select_policy
  ON public.agriclimatic_admin
  FOR SELECT
  USING (auth.role() = 'authenticated' OR public.current_user_is_admin());

-- Only admins can append new snapshots.
CREATE POLICY agriclimatic_admin_insert_policy
  ON public.agriclimatic_admin
  FOR INSERT
  WITH CHECK (public.current_user_is_admin());

COMMIT;
