-- Fix KV3-2026-002: Prevent is_admin self-escalation via RLS
-- The existing UPDATE policy on member.members allows authenticated users to update
-- any column in their own row, including is_admin. This migration adds a WITH CHECK
-- clause that prevents users from modifying the is_admin column.

-- Drop the existing permissive update policy
DROP POLICY IF EXISTS "Allow user to update their own profile" ON member.members;

-- Recreate with a WITH CHECK clause that prevents is_admin modification.
-- The WITH CHECK ensures the is_admin value cannot be changed from what it currently is.
-- Users can update their own profile fields (display_name, etc.) but not is_admin.
CREATE POLICY "Allow user to update their own profile" ON member.members
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin = (SELECT m.is_admin FROM member.members m WHERE m.id = auth.uid())
  );
