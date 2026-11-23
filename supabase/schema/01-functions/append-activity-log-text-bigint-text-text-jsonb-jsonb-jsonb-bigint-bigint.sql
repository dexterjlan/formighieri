-- Name: append_activity_log(text, bigint, text, text, jsonb, jsonb, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.append_activity_log(p_entity_type text, p_entity_id bigint, p_action text, p_field_name text DEFAULT NULL::text, p_previous_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.id INTO v_user_id
    FROM public."appUsers" u
    WHERE u."authId" = auth.uid()
    LIMIT 1;

    RETURN public.insert_activity_log_row(
        p_entity_type,
        p_entity_id,
        p_action,
        p_field_name,
        p_previous_value,
        p_new_value,
        v_user_id,
        p_metadata,
        p_order_project_id,
        p_order_id
    );
END;
$$;
