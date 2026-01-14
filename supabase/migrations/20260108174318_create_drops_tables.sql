/*
  # Create Drops and Drop Access Tables

  ## Overview
  This migration creates the drops and drop_access tables to manage monthly gear releases
  and control which users can access specific products based on their mileage.

  ## New Tables
  
  ### `drops`
  Product drops/releases with mileage requirements
  - `id` (uuid, primary key) - Unique drop identifier
  - `name` (text, required) - Drop name (e.g., "January 2026 Collection")
  - `description` (text) - Drop description and details
  - `slug` (text, unique) - URL-friendly identifier
  - `release_date` (timestamptz, required) - When drop becomes available
  - `end_date` (timestamptz) - When drop closes (null = ongoing)
  - `required_miles_basic` (decimal) - Miles needed for basic tier access
  - `required_miles_premium` (decimal) - Miles needed for premium tier access
  - `required_miles_exclusive` (decimal) - Miles needed for exclusive tier access
  - `is_active` (boolean) - Whether drop is currently active
  - `is_published` (boolean) - Whether drop is visible to users
  - `image_url` (text) - Featured image for the drop
  - `total_pieces` (integer) - Number of items in drop
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `drop_access`
  Junction table controlling which users can access which drops
  - `id` (uuid, primary key) - Unique identifier
  - `drop_id` (uuid, foreign key -> drops.id) - The drop being accessed
  - `user_id` (uuid, foreign key -> users.id) - User with access
  - `access_tier` (text) - Tier user qualified under (basic/premium/exclusive)
  - `qualified_at` (timestamptz) - When user qualified for access
  - `mileage_at_qualification` (decimal) - User's mileage when they qualified
  - `notified_at` (timestamptz) - When user was notified of access
  - `first_viewed_at` (timestamptz) - When user first viewed the drop
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  
  ### Row Level Security (RLS)
  
  #### drops table
  - **SELECT**: Anyone can view published active drops
  - **INSERT/UPDATE/DELETE**: Only service role (admin operations)
  
  #### drop_access table
  - **SELECT**: Users can only see their own access records
  - **INSERT**: Only service role (granted via qualification check)
  - **UPDATE/DELETE**: Only service role

  ## Business Logic
  
  ### Qualification Process
  1. Admin creates new drop with mileage requirements
  2. System checks all users' mileage_summary.current_month_miles
  3. Users meeting requirements get drop_access record created
  4. Users are notified via email
  5. Users can view and purchase items in drops they have access to

  ### Access Tiers
  - Different tiers may see different products in same drop
  - Higher tiers see everything lower tiers see + exclusive items
  - Tier determined by mileage at qualification time

  ## Indexes
  - Index on drops.slug for URL lookups
  - Index on drops.is_published for public queries
  - Composite index on drop_access (user_id, drop_id) for access checks
  - Index on drop_access.drop_id for finding all users with access to a drop

  ## Notes
  - A user can have access to multiple drops simultaneously
  - Access is granted based on mileage at qualification time (frozen)
  - If user's mileage increases, they don't auto-upgrade tier for existing drops
  - New drops check current mileage, so increased mileage helps future drops
*/

-- Create drops table
CREATE TABLE IF NOT EXISTS drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text UNIQUE NOT NULL,
  release_date timestamptz NOT NULL,
  end_date timestamptz,
  required_miles_basic decimal DEFAULT 50,
  required_miles_premium decimal DEFAULT 100,
  required_miles_exclusive decimal DEFAULT 150,
  is_active boolean DEFAULT true,
  is_published boolean DEFAULT false,
  image_url text,
  total_pieces integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create drop_access table
CREATE TABLE IF NOT EXISTS drop_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_tier text NOT NULL CHECK (access_tier IN ('basic', 'premium', 'exclusive')),
  qualified_at timestamptz DEFAULT now(),
  mileage_at_qualification decimal NOT NULL,
  notified_at timestamptz,
  first_viewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(drop_id, user_id)
);

-- Enable RLS on drops
ALTER TABLE drops ENABLE ROW LEVEL SECURITY;

-- Anyone can view published drops
CREATE POLICY "Anyone can view published drops"
  ON drops
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Service role can manage drops
CREATE POLICY "Service role can insert drops"
  ON drops
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update drops"
  ON drops
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete drops"
  ON drops
  FOR DELETE
  TO service_role
  USING (true);

-- Enable RLS on drop_access
ALTER TABLE drop_access ENABLE ROW LEVEL SECURITY;

-- Users can view their own drop access
CREATE POLICY "Users can view own drop access"
  ON drop_access
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage drop access
CREATE POLICY "Service role can insert drop access"
  ON drop_access
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update drop access"
  ON drop_access
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete drop access"
  ON drop_access
  FOR DELETE
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_drops_slug ON drops(slug);
CREATE INDEX IF NOT EXISTS idx_drops_published ON drops(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_drops_active ON drops(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_drops_release_date ON drops(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_drop_access_user_drop ON drop_access(user_id, drop_id);
CREATE INDEX IF NOT EXISTS idx_drop_access_drop ON drop_access(drop_id);
CREATE INDEX IF NOT EXISTS idx_drop_access_tier ON drop_access(access_tier);

-- Create trigger for drops updated_at
CREATE TRIGGER update_drops_updated_at
  BEFORE UPDATE ON drops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to grant drop access to qualifying users
CREATE OR REPLACE FUNCTION grant_drop_access_to_qualifying_users(p_drop_id uuid)
RETURNS integer AS $$
DECLARE
  v_drop drops%ROWTYPE;
  v_granted_count integer := 0;
BEGIN
  -- Get drop details
  SELECT * INTO v_drop FROM drops WHERE id = p_drop_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drop not found';
  END IF;

  -- Grant access to users meeting exclusive tier requirements
  INSERT INTO drop_access (drop_id, user_id, access_tier, mileage_at_qualification)
  SELECT 
    p_drop_id,
    user_id,
    'exclusive',
    current_month_miles
  FROM mileage_summary
  WHERE current_month_miles >= v_drop.required_miles_exclusive
  ON CONFLICT (drop_id, user_id) DO NOTHING;
  
  v_granted_count := v_granted_count + (SELECT COUNT(*) FROM mileage_summary WHERE current_month_miles >= v_drop.required_miles_exclusive);

  -- Grant access to users meeting premium tier requirements (but not exclusive)
  INSERT INTO drop_access (drop_id, user_id, access_tier, mileage_at_qualification)
  SELECT 
    p_drop_id,
    user_id,
    'premium',
    current_month_miles
  FROM mileage_summary
  WHERE current_month_miles >= v_drop.required_miles_premium 
    AND current_month_miles < v_drop.required_miles_exclusive
  ON CONFLICT (drop_id, user_id) DO NOTHING;

  -- Grant access to users meeting basic tier requirements (but not premium)
  INSERT INTO drop_access (drop_id, user_id, access_tier, mileage_at_qualification)
  SELECT 
    p_drop_id,
    user_id,
    'basic',
    current_month_miles
  FROM mileage_summary
  WHERE current_month_miles >= v_drop.required_miles_basic 
    AND current_month_miles < v_drop.required_miles_premium
  ON CONFLICT (drop_id, user_id) DO NOTHING;

  -- Return total count of users granted access
  SELECT COUNT(*) INTO v_granted_count FROM drop_access WHERE drop_id = p_drop_id;
  
  RETURN v_granted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has access to a drop
CREATE OR REPLACE FUNCTION user_has_drop_access(p_user_id uuid, p_drop_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM drop_access 
    WHERE user_id = p_user_id AND drop_id = p_drop_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;