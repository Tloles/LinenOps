-- =============================================================
-- LinenOps: RLS Policies + record_scan function
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================================

-- 1. Enable RLS on all tables (idempotent)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if re-running (safe to ignore errors)
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can read bins" ON public.bins;
DROP POLICY IF EXISTS "Authenticated users can insert bins" ON public.bins;
DROP POLICY IF EXISTS "Authenticated users can update bins" ON public.bins;
DROP POLICY IF EXISTS "Authenticated users can read scan_events" ON public.scan_events;
DROP POLICY IF EXISTS "Authenticated users can insert scan_events" ON public.scan_events;

-- 3. Customers policies
CREATE POLICY "Authenticated users can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Bins policies
CREATE POLICY "Authenticated users can read bins"
  ON public.bins FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bins"
  ON public.bins FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bins"
  ON public.bins FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Scan events policies
CREATE POLICY "Authenticated users can read scan_events"
  ON public.scan_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scan_events"
  ON public.scan_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 6. record_scan function
-- Atomically inserts a scan event and updates the bin's current_status
CREATE OR REPLACE FUNCTION public.record_scan(
  p_bin_id uuid,
  p_status text,
  p_scanned_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event scan_events;
BEGIN
  -- Insert the scan event
  INSERT INTO public.scan_events (bin_id, status, scanned_by, notes)
  VALUES (p_bin_id, p_status, COALESCE(p_scanned_by, auth.uid()), p_notes)
  RETURNING * INTO v_event;

  -- Update the bin's current status
  UPDATE public.bins
  SET current_status = p_status,
      retired_at = CASE WHEN p_status = 'retired' THEN NOW() ELSE retired_at END
  WHERE id = p_bin_id;

  RETURN row_to_json(v_event);
END;
$$;
