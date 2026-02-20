-- Create DB-backed farmer notifications for admin actions
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.farmer_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cluster_id uuid REFERENCES public.clusters(id) ON DELETE SET NULL,
  farm_id uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  notification_type text NOT NULL DEFAULT 'notify',
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_farmer_notifications_recipient_created_at
  ON public.farmer_notifications(recipient_user_id, created_at DESC);

ALTER TABLE public.farmer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmer can view own notifications" ON public.farmer_notifications;
CREATE POLICY "Farmer can view own notifications"
  ON public.farmer_notifications
  FOR SELECT
  USING (
    auth.uid() = recipient_user_id
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = recipient_user_id
        AND lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

DROP POLICY IF EXISTS "Farmer can update own notifications" ON public.farmer_notifications;
CREATE POLICY "Farmer can update own notifications"
  ON public.farmer_notifications
  FOR UPDATE
  USING (
    auth.uid() = recipient_user_id
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = recipient_user_id
        AND lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  WITH CHECK (
    auth.uid() = recipient_user_id
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = recipient_user_id
        AND lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

DROP POLICY IF EXISTS "Admin can insert farmer notifications" ON public.farmer_notifications;
CREATE POLICY "Admin can insert farmer notifications"
  ON public.farmer_notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage notifications" ON public.farmer_notifications;
CREATE POLICY "Service role can manage notifications"
  ON public.farmer_notifications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
