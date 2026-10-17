-- Supports safe retries when the browser times out after the user message was
-- committed. Only requests with an explicit client key participate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentdesk_widget_user_message_idempotency
  ON public.messages (conversation_id, (metadata ->> 'client_message_id'))
  WHERE role = 'user' AND metadata ? 'client_message_id';

CREATE INDEX IF NOT EXISTS idx_agentdesk_widget_assistant_message_idempotency
  ON public.messages (conversation_id, (metadata ->> 'reply_to_client_message_id'))
  WHERE role = 'assistant' AND metadata ? 'reply_to_client_message_id';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentdesk_widget_assistant_reply_once
  ON public.messages (conversation_id, (metadata ->> 'reply_to_client_message_id'))
  WHERE role = 'assistant' AND metadata ? 'reply_to_client_message_id';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentdesk_widget_escalation_note_once
  ON public.messages (conversation_id)
  WHERE role = 'system' AND metadata ->> 'event' = 'visitor_escalation';

-- Commit a newly staged ingestion run atomically. Re-indexing keeps its old
-- chunks until every replacement embedding has been saved successfully.
CREATE OR REPLACE FUNCTION public.commit_source_ingestion(
  p_source_id uuid,
  p_business_id uuid,
  p_ingest_run_id uuid,
  p_expected_chunks integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     OR p_expected_chunks < 1 OR p_expected_chunks > 30 THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_count FROM public.chunks
    WHERE source_id = p_source_id AND business_id = p_business_id
      AND metadata ->> 'ingest_run_id' = p_ingest_run_id::text;
  IF v_count <> p_expected_chunks THEN RAISE EXCEPTION 'staged chunk count mismatch'; END IF;
  DELETE FROM public.chunks
    WHERE source_id = p_source_id AND business_id = p_business_id
      AND metadata ->> 'ingest_run_id' IS DISTINCT FROM p_ingest_run_id::text;
  UPDATE public.sources SET
    chunks_count = v_count, status = 'completed', last_scraped_at = now(), error_message = null
    WHERE id = p_source_id AND business_id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source does not exist for workspace'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_source_ingestion(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_source_ingestion(uuid, uuid, uuid, integer) TO service_role;
