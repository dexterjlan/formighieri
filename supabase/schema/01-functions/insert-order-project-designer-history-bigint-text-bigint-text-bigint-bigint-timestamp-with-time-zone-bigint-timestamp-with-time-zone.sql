-- Name: insert_order_project_designer_history(bigint, text, bigint, text, bigint, bigint, timestamp with time zone, bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.insert_order_project_designer_history(p_order_project_id bigint, p_source_type text, p_source_id bigint, p_source_label text, p_previous_designer_id bigint, p_new_designer_id bigint, p_changed_at timestamp with time zone, p_changed_by_id bigint, p_previous_started_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    duration_seconds bigint;
BEGIN
    IF p_previous_designer_id IS NOT NULL AND p_previous_started_at IS NOT NULL THEN
        duration_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (p_changed_at - p_previous_started_at)))::bigint
        );
    END IF;

    INSERT INTO public."OrderProjectDesignerHistory" (
        "orderProjectId",
        "sourceType",
        "sourceId",
        "sourceLabel",
        "previousDesignerId",
        "newDesignerId",
        "changedAt",
        "changedById",
        "previousDesignerDurationSeconds"
    ) VALUES (
        p_order_project_id,
        p_source_type,
        p_source_id,
        p_source_label,
        p_previous_designer_id,
        p_new_designer_id,
        p_changed_at,
        p_changed_by_id,
        duration_seconds
    );
END;
$$;
