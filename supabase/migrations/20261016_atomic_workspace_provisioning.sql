-- Ensure a user's workspace exists before any workspace-dependent API runs.
-- The per-user advisory lock makes concurrent first requests idempotent even
-- when no workspace row exists yet to lock.
CREATE OR REPLACE FUNCTION public.get_or_create_business(
  p_user_id uuid,
  p_initial_name text DEFAULT 'My Company'
) RETURNS SETOF public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:workspace:' || p_user_id::text, 0));

  SELECT * INTO v_business
    FROM public.businesses
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1;
  IF FOUND THEN
    RETURN NEXT v_business;
    RETURN;
  END IF;

  INSERT INTO public.businesses(user_id, name, website, plan)
    VALUES (p_user_id, coalesce(nullif(left(trim(p_initial_name), 120), ''), 'My Company'), '', 'free')
    RETURNING * INTO v_business;

  RETURN NEXT v_business;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_business(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_business(uuid, text) TO service_role;

-- Embedding requests have their own per-IP minute bucket so a permitted
-- source can contain more chunks than the customer-chat minute limit. They
-- still consume the same hard global daily AI request budget.
ALTER TABLE public.ai_usage_windows DROP CONSTRAINT IF EXISTS ai_usage_windows_scope_type_check;
ALTER TABLE public.ai_usage_windows ADD CONSTRAINT ai_usage_windows_scope_type_check
  CHECK (scope_type IN ('global_day', 'business_month', 'ip_minute', 'ip_ingest_minute'));

CREATE OR REPLACE FUNCTION public.reserve_ai_ingestion_usage(
  p_ip_hash text,
  p_global_daily_limit integer,
  p_ip_minute_limit integer
) RETURNS TABLE(allowed boolean, reason text, retry_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_minute timestamptz := date_trunc('minute', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_global integer := 0;
  v_ip integer := 0;
  v_ip_key text := coalesce(nullif(p_ip_hash, ''), 'unknown');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR length(v_ip_key) > 128 THEN
    RETURN QUERY SELECT false, 'forbidden'::text, NULL::timestamptz;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:global:' || v_day::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:ingest-ip:' || v_ip_key || ':' || v_minute::text, 0));
  SELECT request_count INTO v_global FROM public.ai_usage_windows
    WHERE scope_type = 'global_day' AND scope_key = 'all' AND window_start = v_day;
  SELECT request_count INTO v_ip FROM public.ai_usage_windows
    WHERE scope_type = 'ip_ingest_minute' AND scope_key = v_ip_key AND window_start = v_minute;
  IF coalesce(v_global, 0) >= least(greatest(p_global_daily_limit, 1), 100) THEN
    RETURN QUERY SELECT false, 'global_daily'::text, v_day + interval '1 day';
    RETURN;
  END IF;
  IF coalesce(v_ip, 0) >= least(greatest(p_ip_minute_limit, 1), 100) THEN
    RETURN QUERY SELECT false, 'ip_ingest_minute'::text, v_minute + interval '1 minute';
    RETURN;
  END IF;
  INSERT INTO public.ai_usage_windows(scope_type, scope_key, window_start, request_count)
    VALUES ('global_day', 'all', v_day, 1)
    ON CONFLICT (scope_type, scope_key, window_start) DO UPDATE
      SET request_count = public.ai_usage_windows.request_count + 1;
  INSERT INTO public.ai_usage_windows(scope_type, scope_key, window_start, request_count)
    VALUES ('ip_ingest_minute', v_ip_key, v_minute, 1)
    ON CONFLICT (scope_type, scope_key, window_start) DO UPDATE
      SET request_count = public.ai_usage_windows.request_count + 1;
  RETURN QUERY SELECT true, 'allowed'::text, NULL::timestamptz;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_ingestion_usage(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_ingestion_usage(text, integer, integer) TO service_role;
