-- Name: latest_designer_history_started_at(bigint, text, bigint, bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.latest_designer_history_started_at(p_order_project_id bigint, p_source_type text, p_source_id bigint, p_previous_designer_id bigint, p_fallback_at timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    started_at timestamptz;
BEGIN
    SELECT h."changedAt"
    INTO started_at
    FROM public."OrderProjectDesignerHistory" h
    WHERE h."orderProjectId" = p_order_project_id
      AND h."sourceType" = p_source_type
      AND h."sourceId" IS NOT DISTINCT FROM p_source_id
      AND h."newDesignerId" IS NOT DISTINCT FROM p_previous_designer_id
    ORDER BY h."changedAt" DESC
    LIMIT 1;

    RETURN COALESCE(started_at, p_fallback_at);
END;
$$;
