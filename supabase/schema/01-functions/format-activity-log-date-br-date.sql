-- Name: format_activity_log_date_br(date); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.format_activity_log_date_br(p_date date) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE
        WHEN p_date IS NULL THEN '—'
        ELSE to_char(p_date, 'DD/MM/YYYY')
    END;
$$;
