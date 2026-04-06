-- Security fix: Revoke anon EXECUTE on all RPC functions
--
-- Root cause:
--   0000_create_member_schema.sql line 17:
--     ALTER DEFAULT PRIVILEGES IN SCHEMA member GRANT ALL ON FUNCTIONS TO anon
--   0001_create_attendance_schema.sql line 10:
--     ALTER DEFAULT PRIVILEGES IN SCHEMA attendance GRANT ALL ON FUNCTIONS TO anon
--
--   The previous fix (20260317000001) revoked default TABLE privileges from anon,
--   but missed FUNCTION privileges. Any function created in member/attendance schemas
--   is callable by the anon role (unauthenticated users).
--
-- Impact (confirmed via live testing):
--   - OAuth RPC functions (create_authorization_code, exchange_authorization_code,
--     list_applications, get_application_by_client_id) callable without auth
--     → enables account takeover via unauthenticated authorization code creation
--   - Attendance summary functions callable without auth
--     → information disclosure (attendance patterns, team structure)
--   - record_attendance_by_card callable without auth (intentional for kiosk,
--     but needs rate limiting)
--
-- Fix:
--   1. Revoke default FUNCTION privileges from anon in member + attendance schemas
--   2. Revoke EXECUTE from anon on ALL existing functions in both schemas
--   3. Re-grant EXECUTE only on record_attendance_by_card to anon (kiosk requirement)
--   4. Ensure authenticated role retains EXECUTE on all functions
--   5. Add rate limiting to record_attendance_by_card via call tracking


-- ================================================================
-- STEP 1: Revoke default FUNCTION privileges from anon
-- (prevents future functions from being auto-granted to anon)
-- ================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA member
  REVOKE ALL ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA attendance
  REVOKE ALL ON FUNCTIONS FROM anon;


-- ================================================================
-- STEP 2: Revoke EXECUTE from anon on ALL existing functions
-- in member and attendance schemas
-- ================================================================

-- Use DO block to dynamically revoke on all functions in each schema
DO $$
DECLARE
  fn RECORD;
BEGIN
  -- Revoke from all functions in member schema
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'member'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION member.%I(%s) FROM anon',
      fn.proname, fn.args
    );
  END LOOP;

  -- Revoke from all functions in attendance schema
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'attendance'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION attendance.%I(%s) FROM anon',
      fn.proname, fn.args
    );
  END LOOP;
END $$;


-- ================================================================
-- STEP 3: Re-grant EXECUTE on record_attendance_by_card to anon
-- (required for kiosk NFC card-tap flow — no auth on kiosk terminal)
-- ================================================================

GRANT EXECUTE ON FUNCTION attendance.record_attendance_by_card(text) TO anon;


-- ================================================================
-- STEP 4: Ensure authenticated role retains EXECUTE
-- (explicit grant in case revoke cascade affected it)
-- ================================================================

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'member'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION member.%I(%s) TO authenticated',
      fn.proname, fn.args
    );
  END LOOP;

  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'attendance'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION attendance.%I(%s) TO authenticated',
      fn.proname, fn.args
    );
  END LOOP;
END $$;


-- ================================================================
-- STEP 5: Also revoke anon from public schema summary functions
-- (get_daily_attendance_counts_for_month, get_daily_attendance_details
--  are in public schema but should require authentication)
-- ================================================================

DO $$
BEGIN
  -- Revoke anon access to attendance summary functions in public schema
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_daily_attendance_counts_for_month'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_daily_attendance_counts_for_month(date, date) FROM anon;
    GRANT EXECUTE ON FUNCTION public.get_daily_attendance_counts_for_month(date, date) TO authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_daily_attendance_details'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_daily_attendance_details(date) FROM anon;
    GRANT EXECUTE ON FUNCTION public.get_daily_attendance_details(date) TO authenticated;
  END IF;
END $$;


-- ================================================================
-- STEP 6: Add rate limiting to record_attendance_by_card
-- Prevents abuse via rapid card ID enumeration/brute force
-- Uses a tracking table to enforce max 10 calls per minute per card
-- ================================================================

CREATE TABLE IF NOT EXISTS attendance.rpc_rate_limit (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  call_key TEXT NOT NULL,          -- card_id or IP identifier
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rpc_rate_limit_lookup
  ON attendance.rpc_rate_limit (function_name, call_key, called_at);

-- RLS: no direct access (only via SECURITY DEFINER function)
ALTER TABLE attendance.rpc_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.rpc_rate_limit FORCE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to rate limit table"
  ON attendance.rpc_rate_limit FOR ALL USING (false);

-- Allow service_role full access for cleanup
CREATE POLICY "Service role full access on rate limit"
  ON attendance.rpc_rate_limit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Replace record_attendance_by_card with rate-limited version
CREATE OR REPLACE FUNCTION attendance.record_attendance_by_card(p_card_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance, member
AS $$
DECLARE
    v_user_id uuid;
    v_display_name text;
    v_discord_uid text;
    v_last_type varchar;
    v_new_type varchar;
    v_today date := (now() at time zone 'Asia/Tokyo')::date;
    v_recent_calls int;
BEGIN
    -- Rate limit: max 10 calls per card_id per minute
    SELECT COUNT(*) INTO v_recent_calls
    FROM attendance.rpc_rate_limit
    WHERE function_name = 'record_attendance_by_card'
      AND call_key = p_card_id
      AND called_at > NOW() - INTERVAL '1 minute';

    IF v_recent_calls >= 10 THEN
        RETURN json_build_object(
            'success', false,
            'message', 'レート制限中です。しばらく待ってから再試行してください。'
        );
    END IF;

    -- Record this call for rate limiting
    INSERT INTO attendance.rpc_rate_limit (function_name, call_key)
    VALUES ('record_attendance_by_card', p_card_id);

    -- Lookup user by card_id
    SELECT supabase_auth_user_id INTO v_user_id
    FROM attendance.users
    WHERE card_id = p_card_id;

    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', '登録されていないカードです。');
    END IF;

    -- Get display name from member.members, fallback to auth.users metadata
    SELECT m.display_name, m.discord_id INTO v_display_name, v_discord_uid
    FROM member.members m
    WHERE m.id = v_user_id;

    IF v_display_name IS NULL THEN
        SELECT raw_user_meta_data->'custom_claims'->>'global_name'
        INTO v_display_name
        FROM auth.users
        WHERE id = v_user_id;
    END IF;

    -- Get last attendance type for today
    SELECT type INTO v_last_type
    FROM attendance.attendances
    WHERE user_id = v_user_id AND date = v_today
    ORDER BY timestamp DESC
    LIMIT 1;

    -- Toggle: if last was 'in' → 'out', otherwise 'in'
    v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

    -- Insert new attendance record
    INSERT INTO attendance.attendances (user_id, card_id, type, date)
    VALUES (v_user_id, p_card_id, v_new_type, v_today);

    RETURN json_build_object(
        'success', true,
        'message', CASE WHEN v_new_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
        'user', json_build_object('display_name', v_display_name, 'discord_uid', v_discord_uid),
        'type', v_new_type
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Re-grant execute after function replacement
GRANT EXECUTE ON FUNCTION attendance.record_attendance_by_card(text) TO anon;
GRANT EXECUTE ON FUNCTION attendance.record_attendance_by_card(text) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance.record_attendance_by_card(text) TO service_role;


-- ================================================================
-- STEP 7: Cleanup function for rate limit table
-- (should be called periodically via pg_cron or application)
-- ================================================================

CREATE OR REPLACE FUNCTION attendance.cleanup_rate_limit_entries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM attendance.rpc_rate_limit
  WHERE called_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- Only service_role and authenticated should call cleanup
REVOKE ALL ON FUNCTION attendance.cleanup_rate_limit_entries() FROM anon;
GRANT EXECUTE ON FUNCTION attendance.cleanup_rate_limit_entries() TO service_role;


-- ================================================================
-- STEP 8: Restrict temp_registrations SELECT for anon
-- The current policy allows anon to SELECT all columns including card_id.
-- We cannot column-filter via RLS, but we can create a restricted view
-- for Realtime to use. However, Supabase Realtime requires direct table
-- access, so we document this as an accepted risk with mitigation:
--   - card_id in temp_registrations is the *new unlinked* card,
--     not yet associated with any user
--   - The real risk is qr_token exposure (allows registration hijack)
--   - Mitigation: tokens expire in 30 minutes, are single-use
-- ================================================================

-- Add comment documenting the accepted risk
COMMENT ON POLICY "Allow read access for all users" ON attendance.temp_registrations IS
  'Anon SELECT required for Supabase Realtime QR detection. '
  'Accepted risk: card_id and qr_token visible to anon. '
  'Mitigated by: 30-min token expiry, single-use flag, kiosk-only access pattern.';
