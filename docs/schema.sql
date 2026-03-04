-- LinenOps Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- CUSTOM TYPES
-- ============================================

CREATE TYPE bin_status AS ENUM (
  'clean_staged',
  'loaded',
  'delivered',
  'picked_up_soiled',
  'received_at_plant',
  'in_process',
  'lost',
  'retired'
);

CREATE TYPE customer_type AS ENUM (
  'hotel',
  'limited_service',
  'massage_envy',
  'hand_and_stone'
);

CREATE TYPE user_role AS ENUM (
  'owner',
  'driver',
  'production'
);

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMERS
-- ============================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  type customer_type NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BINS
-- ============================================

CREATE TABLE bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE NOT NULL,
  description TEXT,
  customer_id UUID NOT NULL REFERENCES customers(id),
  current_status bin_status NOT NULL DEFAULT 'clean_staged',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- ============================================
-- SCAN EVENTS (append-only log)
-- ============================================

CREATE TABLE scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id UUID NOT NULL REFERENCES bins(id),
  status bin_status NOT NULL,
  scanned_by UUID NOT NULL REFERENCES auth.users(id),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup: scan a barcode, find the bin
CREATE INDEX idx_bins_barcode ON bins(barcode);

-- Fast lookup: all bins for a customer
CREATE INDEX idx_bins_customer ON bins(customer_id);

-- Fast lookup: all bins with a given status
CREATE INDEX idx_bins_status ON bins(current_status);

-- Fast lookup: scan history for a bin
CREATE INDEX idx_scan_events_bin ON scan_events(bin_id);

-- Fast lookup: recent scans (for activity feed)
CREATE INDEX idx_scan_events_scanned_at ON scan_events(scanned_at DESC);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Bins
ALTER TABLE bins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bins"
  ON bins FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners can insert bins"
  ON bins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can update bins"
  ON bins FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- For status updates via scanning, we'll use a function (see below)
-- so drivers and production staff don't need direct UPDATE on bins

-- Scan Events
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scan events"
  ON scan_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scan events"
  ON scan_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- FUNCTION: Record a scan and update bin status
-- ============================================
-- This is the main operation. Any authenticated user can scan.
-- It inserts a scan_event AND updates the bin's current_status
-- in a single transaction.

CREATE OR REPLACE FUNCTION record_scan(
  p_bin_id UUID,
  p_status bin_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert the scan event
  INSERT INTO scan_events (bin_id, status, scanned_by, notes)
  VALUES (p_bin_id, p_status, auth.uid(), p_notes)
  RETURNING id INTO v_event_id;

  -- Update the bin's current status
  UPDATE bins
  SET current_status = p_status,
      retired_at = CASE WHEN p_status = 'retired' THEN NOW() ELSE retired_at END
  WHERE id = p_bin_id;

  RETURN v_event_id;
END;
$$;

-- ============================================
-- FUNCTION: Auto-create profile on user signup
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'production')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
