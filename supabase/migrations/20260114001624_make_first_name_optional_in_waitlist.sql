/*
  # Make first_name optional in waitlist table

  1. Changes
    - Alter `first_name` column to be nullable instead of required
    - This allows email-only signups while maintaining backward compatibility
  
  2. Rationale
    - Simplified signup form now only collects email
    - Reduces friction for users joining the waitlist
    - Existing records with first_name remain unchanged
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waitlist' 
    AND column_name = 'first_name'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE waitlist ALTER COLUMN first_name DROP NOT NULL;
  END IF;
END $$;
