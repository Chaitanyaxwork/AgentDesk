-- Additive migration. No existing customer data is deleted.
CREATE TABLE IF NOT EXISTS public.ai_usage_windows (
  scope_type text NOT NULL CHECK (scope_type IN ('global_day', 'business_month', 'ip_minute')),
  scope_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (scope_type, scope_key, window_start)
);

ALTER TABLE public.ai_usage_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_windows TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(
  p_business_id uuid,
  p_ip_hash text,
  p_is_reply boolean,
  p_global_daily_limit integer,
  p_workspace_monthly_limit integer,
  p_ip_minute_limit integer
)
RETURNS TABLE(allowed boolean, reason text, retry_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_minute timestamptz := date_trunc('minute', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_global integer := 0;
  v_business integer := 0;
  v_ip integer := 0;
  v_ip_key text := coalesce(nullif(p_ip_hash, ''), 'unknown');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN QUERY SELECT false, 'forbidden'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_business_id IS NULL OR length(v_ip_key) > 128 THEN
    RETURN QUERY SELECT false, 'invalid_request'::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Fixed lock ordering makes each reservation atomic under concurrent requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:global:' || v_day::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:ip:' || v_ip_key || ':' || v_minute::text, 0));
  IF p_is_reply THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:business:' || p_business_id::text || ':' || v_month::text, 0));
  END IF;

  SELECT request_count INTO v_global FROM public.ai_usage_windows
    WHERE scope_type = 'global_day' AND scope_key = 'all' AND window_start = v_day;
  SELECT request_count INTO v_ip FROM public.ai_usage_windows
    WHERE scope_type = 'ip_minute' AND scope_key = v_ip_key AND window_start = v_minute;
  IF p_is_reply THEN
    SELECT request_count INTO v_business FROM public.ai_usage_windows
      WHERE scope_type = 'business_month' AND scope_key = p_business_id::text AND window_start = v_month;
  END IF;

  IF coalesce(v_global, 0) >= least(greatest(p_global_daily_limit, 1), 100) THEN
    RETURN QUERY SELECT false, 'global_daily'::text, v_day + interval '1 day';
    RETURN;
  END IF;
  IF coalesce(v_ip, 0) >= least(greatest(p_ip_minute_limit, 1), 30) THEN
    RETURN QUERY SELECT false, 'ip_minute'::text, v_minute + interval '1 minute';
    RETURN;
  END IF;
  IF p_is_reply AND coalesce(v_business, 0) >= least(greatest(p_workspace_monthly_limit, 1), 10000) THEN
    RETURN QUERY SELECT false, 'workspace_monthly'::text, v_month + interval '1 month';
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_windows(scope_type, scope_key, window_start, request_count)
    VALUES ('global_day', 'all', v_day, 1)
    ON CONFLICT (scope_type, scope_key, window_start) DO UPDATE
      SET request_count = public.ai_usage_windows.request_count + 1;
  INSERT INTO public.ai_usage_windows(scope_type, scope_key, window_start, request_count)
    VALUES ('ip_minute', v_ip_key, v_minute, 1)
    ON CONFLICT (scope_type, scope_key, window_start) DO UPDATE
      SET request_count = public.ai_usage_windows.request_count + 1;
  IF p_is_reply THEN
    INSERT INTO public.ai_usage_windows(scope_type, scope_key, window_start, request_count)
      VALUES ('business_month', p_business_id::text, v_month, 1)
      ON CONFLICT (scope_type, scope_key, window_start) DO UPDATE
        SET request_count = public.ai_usage_windows.request_count + 1;
  END IF;

  RETURN QUERY SELECT true, 'allowed'::text, NULL::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, boolean, integer, integer, integer) TO service_role;

-- Vector retrieval runs only through the server's service-role client.
REVOKE ALL ON FUNCTION public.match_chunks(vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_chunks(vector, uuid, double precision, integer) TO service_role;

-- RLS policies call this function for authenticated users; anonymous callers do not need it.
REVOKE ALL ON FUNCTION public.auth_user_has_business_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_user_has_business_access(uuid) TO authenticated, service_role;
