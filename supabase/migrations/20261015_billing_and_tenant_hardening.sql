-- Billing state is private server-side data. Apply after all earlier migrations.
CREATE TABLE IF NOT EXISTS public.billing_plan_mappings (
  mode text NOT NULL CHECK (mode IN ('test','live')) DEFAULT 'test',
  plan_key text NOT NULL CHECK (plan_key IN ('starter','growth','scale')),
  currency text NOT NULL CHECK (currency IN ('INR','USD','GBP','EUR')),
  interval_key text NOT NULL CHECK (interval_key IN ('monthly','annual')),
  period text NOT NULL CHECK (period IN ('monthly','yearly')),
  amount_subunits bigint NOT NULL CHECK (amount_subunits > 0),
  razorpay_plan_id text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mode,plan_key,currency,interval_key)
);

CREATE TABLE IF NOT EXISTS public.agentdesk_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL CHECK (plan_key IN ('starter','growth','scale')),
  region_key text NOT NULL CHECK (region_key IN ('IN','USD','GB','EUR')),
  currency text NOT NULL CHECK (currency IN ('INR','USD','GBP','EUR')),
  interval_key text NOT NULL CHECK (interval_key IN ('monthly','annual')),
  amount_subunits bigint NOT NULL CHECK (amount_subunits > 0),
  mode text NOT NULL CHECK (mode IN ('test','live')) DEFAULT 'test',
  razorpay_plan_id text NOT NULL,
  razorpay_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired','unknown')) DEFAULT 'created',
  current_end timestamptz,
  cancel_requested_at timestamptz,
  checkout_verified_at timestamptz,
  last_event_at bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agentdesk_subscriptions_business ON public.agentdesk_subscriptions(business_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentdesk_one_current_subscription_per_business
  ON public.agentdesk_subscriptions(business_id)
  WHERE status IN ('created','authenticated','active','pending','halted','paused');

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created_at bigint NOT NULL,
  subscription_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_plan_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentdesk_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plan_mappings, public.agentdesk_subscriptions, public.razorpay_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_plan_mappings, public.agentdesk_subscriptions, public.razorpay_webhook_events TO service_role;

-- Paid tiers become valid only when a verified webhook updates the cached plan.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_plan_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_plan_check CHECK (plan IN ('free','starter','growth','scale'));

CREATE OR REPLACE FUNCTION public.apply_razorpay_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at bigint,
  p_subscription_id text,
  p_status text,
  p_current_end timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_subscription public.agentdesk_subscriptions%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
  IF p_event_id IS NULL OR length(p_event_id) > 200 OR p_subscription_id IS NULL OR length(p_subscription_id) > 100 THEN RETURN false; END IF;
  INSERT INTO public.razorpay_webhook_events(event_id,event_type,event_created_at,subscription_id)
  VALUES (p_event_id,left(p_event_type,100),greatest(p_event_created_at,0),p_subscription_id)
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.agentdesk_subscriptions
    SET status = CASE WHEN p_status IN ('authenticated','active','pending','halted','paused','cancelled','completed') THEN p_status ELSE status END,
        current_end = coalesce(p_current_end,current_end),
        last_event_at = greatest(last_event_at,greatest(p_event_created_at,0)),
        updated_at = now()
    WHERE razorpay_subscription_id = p_subscription_id
      AND greatest(p_event_created_at,0) >= last_event_at;

  SELECT * INTO v_subscription FROM public.agentdesk_subscriptions
    WHERE razorpay_subscription_id = p_subscription_id;
  IF FOUND AND (p_status IN ('authenticated','active','pending','halted','paused','cancelled','completed')) THEN
    UPDATE public.businesses SET plan = CASE WHEN v_subscription.status = 'active' THEN v_subscription.plan_key ELSE 'free' END
      WHERE id = v_subscription.business_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_razorpay_subscription_event(text,text,bigint,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_razorpay_subscription_event(text,text,bigint,text,text,timestamptz) TO service_role;

-- Prevent anonymous direct invocation of vector search, and scope it to server code.
REVOKE ALL ON FUNCTION public.match_chunks(vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_chunks(vector, uuid, double precision, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_user_has_business_access(b_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = b_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM public.team_members WHERE business_id = b_id AND user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.auth_user_has_business_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_user_has_business_access(uuid) TO authenticated, service_role;

-- Enforce source/member plan limits at the database boundary under concurrent writes.
CREATE OR REPLACE FUNCTION public.enforce_workspace_plan_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:plan-limit:' || NEW.business_id::text, 0));
  SELECT plan INTO v_plan FROM public.businesses WHERE id = NEW.business_id;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE = '23503'; END IF;
  IF TG_TABLE_NAME = 'sources' THEN
    v_limit := CASE v_plan WHEN 'starter' THEN 3 WHEN 'growth' THEN 10 WHEN 'scale' THEN 25 ELSE 1 END;
    SELECT count(*) INTO v_count FROM public.sources WHERE business_id = NEW.business_id;
    IF v_count >= v_limit THEN RAISE EXCEPTION 'Source plan limit reached' USING ERRCODE = '23514'; END IF;
  ELSE
    v_limit := CASE v_plan WHEN 'growth' THEN 3 WHEN 'scale' THEN 5 ELSE 1 END;
    SELECT count(*) INTO v_count FROM public.team_members
      WHERE business_id = NEW.business_id AND user_id IS DISTINCT FROM (SELECT user_id FROM public.businesses WHERE id = NEW.business_id);
    IF v_count >= greatest(v_limit - 1, 0) THEN RAISE EXCEPTION 'Member plan limit reached' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_enforce_source_plan_limit ON public.sources;
CREATE TRIGGER trigger_enforce_source_plan_limit BEFORE INSERT ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_plan_limits();
DROP TRIGGER IF EXISTS trigger_enforce_member_plan_limit ON public.team_members;
CREATE TRIGGER trigger_enforce_member_plan_limit BEFORE INSERT ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_plan_limits();
REVOKE ALL ON FUNCTION public.enforce_workspace_plan_limits() FROM PUBLIC, anon, authenticated;

-- Keep usage counter retention bounded without a separate paid scheduler.
CREATE OR REPLACE FUNCTION public.reserve_ai_usage(
  p_business_id uuid, p_ip_hash text, p_is_reply boolean,
  p_global_daily_limit integer, p_workspace_monthly_limit integer, p_ip_minute_limit integer
) RETURNS TABLE(allowed boolean, reason text, retry_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now timestamptz := now();
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_minute timestamptz := date_trunc('minute', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_global integer := 0; v_business integer := 0; v_ip integer := 0;
  v_ip_key text := coalesce(nullif(p_ip_hash, ''), 'unknown');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_business_id IS NULL OR p_is_reply IS NULL OR length(v_ip_key) > 128 THEN
    RETURN QUERY SELECT false, 'forbidden'::text, NULL::timestamptz; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:global:' || v_day::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:ip:' || v_ip_key || ':' || v_minute::text, 0));
  IF p_is_reply THEN PERFORM pg_advisory_xact_lock(hashtextextended('agentdesk:business:' || p_business_id::text || ':' || v_month::text, 0)); END IF;
  IF random() < 0.01 THEN
    DELETE FROM public.ai_usage_windows WHERE (scope_type = 'ip_minute' AND window_start < v_now - interval '2 hours')
      OR (scope_type = 'global_day' AND window_start < v_now - interval '3 days')
      OR (scope_type = 'business_month' AND window_start < v_now - interval '3 months');
  END IF;
  SELECT request_count INTO v_global FROM public.ai_usage_windows WHERE scope_type='global_day' AND scope_key='all' AND window_start=v_day;
  SELECT request_count INTO v_ip FROM public.ai_usage_windows WHERE scope_type='ip_minute' AND scope_key=v_ip_key AND window_start=v_minute;
  IF p_is_reply THEN SELECT request_count INTO v_business FROM public.ai_usage_windows WHERE scope_type='business_month' AND scope_key=p_business_id::text AND window_start=v_month; END IF;
  IF coalesce(v_global,0) >= least(greatest(coalesce(p_global_daily_limit,1),1),100) THEN RETURN QUERY SELECT false,'global_daily'::text,v_day+interval '1 day'; RETURN; END IF;
  IF coalesce(v_ip,0) >= least(greatest(coalesce(p_ip_minute_limit,1),1),30) THEN RETURN QUERY SELECT false,'ip_minute'::text,v_minute+interval '1 minute'; RETURN; END IF;
  IF p_is_reply AND coalesce(v_business,0) >= least(greatest(coalesce(p_workspace_monthly_limit,1),1),10000) THEN RETURN QUERY SELECT false,'workspace_monthly'::text,v_month+interval '1 month'; RETURN; END IF;
  INSERT INTO public.ai_usage_windows(scope_type,scope_key,window_start,request_count) VALUES('global_day','all',v_day,1)
    ON CONFLICT(scope_type,scope_key,window_start) DO UPDATE SET request_count=public.ai_usage_windows.request_count+1;
  INSERT INTO public.ai_usage_windows(scope_type,scope_key,window_start,request_count) VALUES('ip_minute',v_ip_key,v_minute,1)
    ON CONFLICT(scope_type,scope_key,window_start) DO UPDATE SET request_count=public.ai_usage_windows.request_count+1;
  IF p_is_reply THEN INSERT INTO public.ai_usage_windows(scope_type,scope_key,window_start,request_count) VALUES('business_month',p_business_id::text,v_month,1)
    ON CONFLICT(scope_type,scope_key,window_start) DO UPDATE SET request_count=public.ai_usage_windows.request_count+1; END IF;
  RETURN QUERY SELECT true,'allowed'::text,NULL::timestamptz;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid,text,boolean,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid,text,boolean,integer,integer,integer) TO service_role;

-- Users can read messages only through conversations in their own workspace.
DROP POLICY IF EXISTS "Users can view messages for their conversations" ON public.messages;
CREATE POLICY "Users can view messages for their conversations" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.auth_user_has_business_access(c.business_id)));
DROP POLICY IF EXISTS "Users can insert messages into their conversations" ON public.messages;
CREATE POLICY "Users can insert messages into their conversations" ON public.messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.auth_user_has_business_access(c.business_id)));
