-- Name: compact_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.compact_project_production_queue() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sequence, id) AS new_seq
        FROM public."ProjectProductionQueue"
    )
    UPDATE public."ProjectProductionQueue" q
    SET sequence = ordered.new_seq,
        "updatedAt" = now()
    FROM ordered
    WHERE q.id = ordered.id
      AND q.sequence IS DISTINCT FROM ordered.new_seq;
END;
$$;
