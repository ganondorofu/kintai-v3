-- Add display_name column to member.members (cache for Discord nickname)
ALTER TABLE member.members ADD COLUMN IF NOT EXISTS display_name text;

-- Create RPC function for single-call kiosk attendance recording
-- Replaces 3 separate PostgREST requests with 1 DB function call
CREATE OR REPLACE FUNCTION attendance.record_attendance_by_card(p_card_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance, member
AS $$
DECLARE
  v_user_id uuid;
  v_display_name text;
  v_last_type text;
  v_new_type text;
  v_now timestamptz := now();
  v_date date := (v_now AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- Step 1: Look up user by card_id
  SELECT u.supabase_auth_user_id INTO v_user_id
  FROM attendance.users u
  WHERE u.card_id = p_card_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', '未登録のカードです。',
      'user', null,
      'type', null
    );
  END IF;

  -- Step 2: Get display_name from member schema
  SELECT m.display_name INTO v_display_name
  FROM member.members m
  WHERE m.supabase_auth_user_id = v_user_id;

  IF v_display_name IS NULL THEN
    v_display_name := '名無しさん';
  END IF;

  -- Step 3: Get last attendance type
  SELECT a.type INTO v_last_type
  FROM attendance.attendances a
  WHERE a.user_id = v_user_id
  ORDER BY a.timestamp DESC
  LIMIT 1;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  -- Step 4: Insert attendance record
  INSERT INTO attendance.attendances (user_id, card_id, type, timestamp, date)
  VALUES (v_user_id, p_card_id, v_new_type, v_now, v_date);

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN v_new_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
    'user', json_build_object('display_name', v_display_name),
    'type', v_new_type
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'message', '打刻処理中にエラーが発生しました: ' || SQLERRM,
    'user', null,
    'type', null
  );
END;
$$;
