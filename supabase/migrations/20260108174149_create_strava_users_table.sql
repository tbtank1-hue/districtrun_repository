/*
  # Create Strava Users Table

  ## Overview
  This migration creates the users table to link waitlist signups with authenticated Strava accounts.
  It securely stores OAuth tokens and tracks connection status.

  ## New Tables
  
  ### `users`
  Main user profile table with Strava integration
  - `id` (uuid, primary key) - Unique user identifier
  - `email` (text, unique, required) - User's email address
  - `strava_id` (bigint, unique, nullable) - Strava athlete ID from their API
  - `strava_access_token` (text, nullable) - Encrypted OAuth access token for Strava API calls
  - `strava_refresh_token` (text, nullable) - Encrypted OAuth refresh token for renewing access
  - `token_expires_at` (timestamptz, nullable) - When the current access token expires
  - `connected_at` (timestamptz, nullable) - When user first connected their Strava account
  - `last_synced_at` (timestamptz, nullable) - Last time we synced activities from Strava
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last profile update timestamp
  - `first_name` (text) - User's first name
  - `last_name` (text, nullable) - User's last name
  - `profile_picture_url` (text, nullable) - Strava profile photo URL
  - `city` (text, nullable) - User's city from Strava
  - `state` (text, nullable) - User's state from Strava

  ## Security
  
  ### Row Level Security (RLS)
  - **SELECT**: Users can only view their own profile data
  - **INSERT**: New users can create their own profile (via auth.uid())
  - **UPDATE**: Users can only update their own profile data
  - **DELETE**: No one can delete users (preserve data integrity)
  
  ### Data Protection
  - OAuth tokens should be encrypted at application level before storage
  - Never expose tokens to frontend clients
  - Only backend/Edge Functions should access token fields

  ## Indexes
  - Primary key index on `id` (automatic)
  - Unique index on `email` for fast lookups and preventing duplicates
  - Unique index on `strava_id` for Strava API integration
  - Index on `last_synced_at` for finding users needing activity sync

  ## Notes
  - Strava tokens expire after 6 hours - refresh_token must be used to get new access_token
  - Users may disconnect/reconnect Strava, so nullable strava fields
  - Profile data from Strava can be refreshed during sync operations
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  strava_id bigint UNIQUE,
  strava_access_token text,
  strava_refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  first_name text NOT NULL DEFAULT '',
  last_name text,
  profile_picture_url text,
  city text,
  state text
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can create own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_strava_id ON users(strava_id) WHERE strava_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_synced ON users(last_synced_at) WHERE strava_id IS NOT NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();