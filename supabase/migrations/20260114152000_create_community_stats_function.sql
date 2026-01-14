/*
  # Create Community Stats Function

  ## Overview
  This migration creates a public function to retrieve aggregated community statistics
  for display on the landing page. This allows real-time stats without exposing
  sensitive user data.

  ## New Functions

  ### `get_community_stats()`
  Returns aggregated community statistics:
  - `waitlist_count` (bigint) - Total number of waitlist signups
  - `total_miles` (decimal) - Sum of all DC metro miles logged by all users
  - `connected_users` (bigint) - Number of users with connected Strava accounts
  - `total_activities` (bigint) - Total number of activities logged

  ## Security
  - Function is marked as SECURITY DEFINER to bypass RLS
  - Only returns aggregated data (no personal information)
  - Safe to call from unauthenticated (anon) role
  - No parameters needed (public stats only)

  ## Usage
  ```sql
  SELECT * FROM get_community_stats();
  ```

  Returns:
  ```
  {
    waitlist_count: 247,
    total_miles: 5280.5,
    connected_users: 42,
    total_activities: 1250
  }
  ```

  ## Performance
  - Uses indexes on waitlist and mileage_summary tables
  - Aggregates are computed on demand (consider caching for high traffic)
  - Fast queries due to small table sizes in early stages
*/

-- Create function to get aggregated community stats
CREATE OR REPLACE FUNCTION get_community_stats()
RETURNS json AS $$
DECLARE
  v_waitlist_count bigint;
  v_total_miles decimal;
  v_connected_users bigint;
  v_total_activities bigint;
BEGIN
  -- Get waitlist count
  SELECT COUNT(*) INTO v_waitlist_count
  FROM waitlist;

  -- Get total miles from all users (DC area only)
  SELECT
    COALESCE(SUM(total_miles), 0),
    COUNT(*),
    COALESCE(SUM(total_activities), 0)
  INTO v_total_miles, v_connected_users, v_total_activities
  FROM mileage_summary;

  -- Return as JSON
  RETURN json_build_object(
    'waitlist_count', v_waitlist_count,
    'total_miles', ROUND(v_total_miles::numeric, 1),
    'connected_users', v_connected_users,
    'total_activities', v_total_activities
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_community_stats() TO anon, authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_community_stats() IS 'Returns aggregated community statistics for public display on landing page';
