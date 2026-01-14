/*
  # Create Activities Table

  ## Overview
  This migration creates the activities table to store individual running activities from Strava.
  Activities are cached locally to avoid repeated API calls and enable fast mileage calculations.

  ## New Tables
  
  ### `activities`
  Stores individual Strava running activities
  - `id` (uuid, primary key) - Internal unique identifier
  - `user_id` (uuid, foreign key -> users.id) - Owner of this activity
  - `strava_activity_id` (bigint, unique, required) - Strava's unique activity ID
  - `activity_type` (text) - Type of activity (Run, TrailRun, VirtualRun)
  - `activity_date` (timestamptz, required) - When the activity occurred
  - `distance_meters` (decimal, required) - Distance in meters from Strava
  - `distance_miles` (decimal, required) - Calculated distance in miles
  - `moving_time_seconds` (integer) - Active moving time in seconds
  - `elapsed_time_seconds` (integer) - Total elapsed time in seconds
  - `total_elevation_gain` (decimal) - Elevation gain in meters
  - `average_speed` (decimal) - Average speed in meters/second
  - `max_speed` (decimal) - Max speed in meters/second
  - `average_heartrate` (decimal, nullable) - Average heart rate if available
  - `max_heartrate` (decimal, nullable) - Max heart rate if available
  - `start_latitude` (decimal, nullable) - Starting GPS latitude
  - `start_longitude` (decimal, nullable) - Starting GPS longitude
  - `city` (text, nullable) - City where activity occurred
  - `state` (text, nullable) - State where activity occurred
  - `country` (text, nullable) - Country where activity occurred
  - `is_dc_metro_area` (boolean) - Whether activity is in DC metro area
  - `manual` (boolean) - Whether manually entered in Strava
  - `synced_at` (timestamptz) - When we imported this activity
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  
  ### Row Level Security (RLS)
  - **SELECT**: Users can only view their own activities
  - **INSERT**: Only service role can insert (via sync Edge Function)
  - **UPDATE**: Only service role can update activity data
  - **DELETE**: Only service role can delete activities

  ## Data Validation
  - DC Metro Area verification via GPS coordinates
  - Bounding box: ~38.8-39.2 latitude, ~-77.5 to -76.9 longitude
  - Includes DC, Arlington, Alexandria, Bethesda, Silver Spring, etc.

  ## Indexes
  - Index on `user_id` for fast user activity queries
  - Unique index on `strava_activity_id` to prevent duplicates
  - Index on `activity_date` for date range queries
  - Index on `is_dc_metro_area` for filtering local runs
  - Composite index on (user_id, activity_date) for user timeline queries

  ## Notes
  - Distance stored in both meters (from Strava) and miles (for display)
  - GPS coordinates used to verify DC metro area eligibility
  - Only "Run" type activities should count toward mileage goals
  - Manual activities may need additional validation
*/

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_activity_id bigint UNIQUE NOT NULL,
  activity_type text NOT NULL DEFAULT 'Run',
  activity_date timestamptz NOT NULL,
  distance_meters decimal NOT NULL,
  distance_miles decimal NOT NULL,
  moving_time_seconds integer DEFAULT 0,
  elapsed_time_seconds integer DEFAULT 0,
  total_elevation_gain decimal DEFAULT 0,
  average_speed decimal,
  max_speed decimal,
  average_heartrate decimal,
  max_heartrate decimal,
  start_latitude decimal,
  start_longitude decimal,
  city text,
  state text,
  country text,
  is_dc_metro_area boolean DEFAULT false,
  manual boolean DEFAULT false,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Users can view their own activities
CREATE POLICY "Users can view own activities"
  ON activities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert activities (via sync function)
CREATE POLICY "Service role can insert activities"
  ON activities
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update activities
CREATE POLICY "Service role can update activities"
  ON activities
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Service role can delete activities
CREATE POLICY "Service role can delete activities"
  ON activities
  FOR DELETE
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_strava_id ON activities(strava_activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_dc_area ON activities(is_dc_metro_area) WHERE is_dc_metro_area = true;
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, activity_date DESC);

-- Create function to check if coordinates are in DC metro area
CREATE OR REPLACE FUNCTION is_in_dc_metro(lat decimal, lon decimal)
RETURNS boolean AS $$
BEGIN
  -- DC Metro Area bounding box
  -- Latitude: ~38.8 to 39.2
  -- Longitude: ~-77.5 to -76.9
  RETURN (
    lat BETWEEN 38.8 AND 39.2 AND
    lon BETWEEN -77.5 AND -76.9
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to convert meters to miles
CREATE OR REPLACE FUNCTION meters_to_miles(meters decimal)
RETURNS decimal AS $$
BEGIN
  RETURN ROUND((meters * 0.000621371)::numeric, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to auto-calculate is_dc_metro_area
CREATE OR REPLACE FUNCTION set_dc_metro_area()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_latitude IS NOT NULL AND NEW.start_longitude IS NOT NULL THEN
    NEW.is_dc_metro_area := is_in_dc_metro(NEW.start_latitude, NEW.start_longitude);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_dc_metro_area
  BEFORE INSERT OR UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION set_dc_metro_area();