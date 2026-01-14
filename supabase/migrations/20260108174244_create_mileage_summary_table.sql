/*
  # Create Mileage Summary Table

  ## Overview
  This migration creates the mileage_summary table for aggregated mileage data and access tier management.
  This table enables fast access control decisions without recalculating mileage on every request.

  ## New Tables
  
  ### `mileage_summary`
  Aggregated mileage data per user for fast access checks
  - `user_id` (uuid, primary key, foreign key -> users.id) - User identifier
  - `current_month_miles` (decimal) - Miles run in the current calendar month (DC area only)
  - `last_month_miles` (decimal) - Miles run in the previous calendar month
  - `current_year_miles` (decimal) - Miles run in the current calendar year (DC area only)
  - `total_miles` (decimal) - All-time total miles (DC area only)
  - `total_activities` (integer) - Total number of activities synced
  - `dc_activities` (integer) - Number of activities in DC metro area
  - `last_activity_date` (timestamptz) - Most recent activity date
  - `access_tier` (text) - Current access level: 'none', 'basic', 'premium', 'exclusive'
  - `last_calculated_at` (timestamptz) - When mileage was last recalculated
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Access Tier Logic
  Current month DC miles determine access tier:
  - **none**: 0-49 miles (no drop access)
  - **basic**: 50-99 miles (standard drops)
  - **premium**: 100-149 miles (premium drops + standard)
  - **exclusive**: 150+ miles (all drops + limited editions)

  ## Security
  
  ### Row Level Security (RLS)
  - **SELECT**: Users can only view their own mileage summary
  - **INSERT**: Only service role can insert (created during first activity sync)
  - **UPDATE**: Only service role can update (recalculated during activity sync)
  - **DELETE**: No one can delete summaries (preserve data integrity)

  ## Performance
  - This table is the single source of truth for access control
  - Updated whenever new activities are synced
  - Eliminates need to aggregate activities on every page load
  - Enables instant access tier checks

  ## Indexes
  - Primary key on user_id (automatic, one row per user)
  - Index on access_tier for finding users by tier
  - Index on current_month_miles for leaderboards

  ## Notes
  - Recalculated monthly (automated job resets current_month to 0)
  - Only DC metro area miles count toward access tiers
  - Total miles includes all activities regardless of location
  - Access tier auto-updated via trigger when mileage changes
*/

-- Create mileage_summary table
CREATE TABLE IF NOT EXISTS mileage_summary (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_month_miles decimal DEFAULT 0,
  last_month_miles decimal DEFAULT 0,
  current_year_miles decimal DEFAULT 0,
  total_miles decimal DEFAULT 0,
  total_activities integer DEFAULT 0,
  dc_activities integer DEFAULT 0,
  last_activity_date timestamptz,
  access_tier text DEFAULT 'none' CHECK (access_tier IN ('none', 'basic', 'premium', 'exclusive')),
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE mileage_summary ENABLE ROW LEVEL SECURITY;

-- Users can view their own mileage summary
CREATE POLICY "Users can view own mileage"
  ON mileage_summary
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert mileage summaries
CREATE POLICY "Service role can insert mileage"
  ON mileage_summary
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update mileage summaries
CREATE POLICY "Service role can update mileage"
  ON mileage_summary
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mileage_access_tier ON mileage_summary(access_tier);
CREATE INDEX IF NOT EXISTS idx_mileage_current_month ON mileage_summary(current_month_miles DESC);
CREATE INDEX IF NOT EXISTS idx_mileage_last_calculated ON mileage_summary(last_calculated_at);

-- Create function to calculate access tier from mileage
CREATE OR REPLACE FUNCTION calculate_access_tier(miles decimal)
RETURNS text AS $$
BEGIN
  IF miles >= 150 THEN
    RETURN 'exclusive';
  ELSIF miles >= 100 THEN
    RETURN 'premium';
  ELSIF miles >= 50 THEN
    RETURN 'basic';
  ELSE
    RETURN 'none';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to auto-update access tier when mileage changes
CREATE OR REPLACE FUNCTION update_access_tier()
RETURNS TRIGGER AS $$
BEGIN
  NEW.access_tier := calculate_access_tier(NEW.current_month_miles);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_access_tier
  BEFORE INSERT OR UPDATE OF current_month_miles ON mileage_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_access_tier();

-- Create function to recalculate mileage for a user
CREATE OR REPLACE FUNCTION recalculate_user_mileage(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_current_month_start timestamptz;
  v_current_year_start timestamptz;
  v_last_month_start timestamptz;
  v_last_month_end timestamptz;
BEGIN
  -- Calculate date boundaries
  v_current_month_start := date_trunc('month', now());
  v_current_year_start := date_trunc('year', now());
  v_last_month_start := date_trunc('month', now() - interval '1 month');
  v_last_month_end := v_current_month_start;

  -- Insert or update mileage summary
  INSERT INTO mileage_summary (
    user_id,
    current_month_miles,
    last_month_miles,
    current_year_miles,
    total_miles,
    total_activities,
    dc_activities,
    last_activity_date,
    last_calculated_at
  )
  SELECT
    p_user_id,
    COALESCE(SUM(CASE 
      WHEN activity_date >= v_current_month_start AND is_dc_metro_area = true 
      THEN distance_miles 
      ELSE 0 
    END), 0) as current_month,
    COALESCE(SUM(CASE 
      WHEN activity_date >= v_last_month_start AND activity_date < v_last_month_end AND is_dc_metro_area = true 
      THEN distance_miles 
      ELSE 0 
    END), 0) as last_month,
    COALESCE(SUM(CASE 
      WHEN activity_date >= v_current_year_start AND is_dc_metro_area = true 
      THEN distance_miles 
      ELSE 0 
    END), 0) as current_year,
    COALESCE(SUM(CASE WHEN is_dc_metro_area = true THEN distance_miles ELSE 0 END), 0) as total,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_dc_metro_area = true) as dc_count,
    MAX(activity_date) as last_date,
    now()
  FROM activities
  WHERE user_id = p_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    current_month_miles = EXCLUDED.current_month_miles,
    last_month_miles = EXCLUDED.last_month_miles,
    current_year_miles = EXCLUDED.current_year_miles,
    total_miles = EXCLUDED.total_miles,
    total_activities = EXCLUDED.total_activities,
    dc_activities = EXCLUDED.dc_activities,
    last_activity_date = EXCLUDED.last_activity_date,
    last_calculated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;