-- Name: activity_log_value_json(jsonb, text); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.activity_log_value_json(p_raw jsonb, p_display text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT jsonb_build_object(
        'raw', p_raw,
        'display', COALESCE(NULLIF(trim(p_display), ''), p_raw #>> '{}')
    );
$$;
