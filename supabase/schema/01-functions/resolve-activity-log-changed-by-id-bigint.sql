-- Name: resolve_activity_log_changed_by_id(bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.resolve_activity_log_changed_by_id(p_row_updated_by_id bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_id bigint;
BEGIN
    IF p_row_updated_by_id IS NOT NULL THEN
        RETURN p_row_updated_by_id;
    END IF;

    SELECT u.id INTO v_id
    FROM public."appUsers" u
    WHERE u."authId" = auth.uid()
    LIMIT 1;

    RETURN v_id;
END;
$$;
