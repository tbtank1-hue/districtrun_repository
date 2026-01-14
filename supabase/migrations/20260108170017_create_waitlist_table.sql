/*
  # Create waitlist table

  1. New Tables
    - `waitlist`
      - `id` (uuid, primary key) - Unique identifier for each signup
      - `email` (text, unique, required) - User's email address
      - `first_name` (text, required) - User's first name
      - `created_at` (timestamptz) - When the user signed up
      - `synced_to_mailchimp` (boolean) - Whether the record has been synced to Mailchimp
      - `mailchimp_subscriber_id` (text, nullable) - Mailchimp subscriber ID for reference

  2. Security
    - Enable RLS on `waitlist` table
    - Add policy for inserting new signups (anyone can sign up)
    - Add policy for authenticated admins to view all signups

  3. Indexes
    - Index on email for faster lookups
    - Index on created_at for chronological queries
*/

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  first_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  synced_to_mailchimp boolean DEFAULT false,
  mailchimp_subscriber_id text
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert into waitlist (public signups)
CREATE POLICY "Anyone can join waitlist"
  ON waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to view all waitlist entries (for admin purposes)
CREATE POLICY "Authenticated users can view waitlist"
  ON waitlist
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update sync status (for Mailchimp integration)
CREATE POLICY "Authenticated users can update sync status"
  ON waitlist
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_synced ON waitlist(synced_to_mailchimp) WHERE synced_to_mailchimp = false;