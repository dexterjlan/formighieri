-- Name: insert_activity_log_row(text, bigint, text, text, jsonb, jsonb, bigint, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.insert_activity_log_row(p_entity_type text, p_entity_id bigint, p_action text, p_field_name text, p_previous_value jsonb, p_new_value jsonb, p_changed_by_id bigint, p_metadata jsonb DEFAULT NULL::jsonb, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_ctx record;
    v_id bigint;
BEGIN
    SELECT * INTO v_ctx
    FROM public.resolve_activity_log_order_context(
        p_entity_type,
        p_entity_id,
        p_order_project_id,
        p_order_id
    );

    INSERT INTO public."ActivityLog" (
        "entityType",
        "entityId",
        action,
        "fieldName",
        "previousValue",
        "newValue",
        "orderProjectId",
        "orderId",
        "changedById",
        metadata
    )
    VALUES (
        p_entity_type,
        p_entity_id,
        p_action,
        p_field_name,
        p_previous_value,
        p_new_value,
        v_ctx."orderProjectId",
        v_ctx."orderId",
        public.resolve_activity_log_changed_by_id(p_changed_by_id),
        p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;
