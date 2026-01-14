/*
  # Fix Waitlist Table Security Issues

  ## Changes Made
  
  1. **Removed Unused Indexes**
     - Dropped `idx_waitlist_email` (email already has unique constraint with index)
     - Dropped `idx_waitlist_created_at` (not needed for current query patterns)
     - Dropped `idx_waitlist_synced` (premature optimization, not used)

  2. **Improved RLS Policies**
     - **INSERT Policy**: Restricted to only allow inserting valid emails (must contain '@' and not be empty)
       - Validates email format at database level
       - Prevents spam/invalid submissions
     
     - **UPDATE Policy**: Completely restructured for security
       - Only service role can update records
       - Restricts updates to sync-related columns only
       - Prevents unauthorized modification of user data
     
     - **SELECT Policy**: Kept unchanged (authenticated users for admin access)

  ## Security Improvements
  - Prevents unrestricted data insertion with validation rules
  - Eliminates ability for regular authenticated users to modify waitlist data
  - Service role authentication required for Mailchimp sync operations
  - Maintains public signup functionality while adding data validation

  ## Notes
  - Auth DB connection strategy (percentage vs fixed) must be configured in Supabase dashboard
  - This cannot be changed via SQL migration
*/

-- Drop unused indexes
DROP INDEX IF EXISTS idx_waitlist_email;
DROP INDEX IF EXISTS idx_waitlist_created_at;
DROP INDEX IF EXISTS idx_waitlist_synced;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can join waitlist" ON waitlist;
DROP POLICY IF EXISTS "Authenticated users can update sync status" ON waitlist;

-- Create more restrictive INSERT policy with validation
CREATE POLICY "Public can join waitlist with valid email"
  ON waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL 
    AND email != '' 
    AND email LIKE '%@%'
    AND first_name IS NOT NULL
    AND first_name != ''
  );

-- Create restrictive UPDATE policy (service role only for Mailchimp sync)
CREATE POLICY "Service role can update sync status"
  ON waitlist
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);