-- Name: order_project_belongs_in_production_queue(bigint, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.order_project_belongs_in_production_queue(p_status_id bigint, p_is_complementary boolean DEFAULT false, p_is_replaced boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
    v_sort integer;
    v_name text;
    v_min integer;
    v_max integer;
BEGIN
    IF COALESCE(p_is_complementary, false) OR COALESCE(p_is_replaced, false) THEN
        RETURN false;
    END IF;

    IF p_status_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT s."sortOrder", s.name
    INTO v_sort, v_name
    FROM public."OrderProjectStatus" s
    WHERE s.id = p_status_id;

    IF v_sort IS NULL THEN
        RETURN false;
    END IF;

    IF v_name = 'Em Produção' THEN
        RETURN false;
    END IF;

    SELECT start_status."sortOrder", end_status."sortOrder"
    INTO v_min, v_max
    FROM public."OrderProjectStatus" start_status
    CROSS JOIN public."OrderProjectStatus" end_status
    WHERE start_status.name = 'Medição Realizada'
      AND end_status.name = 'Implantação'
    LIMIT 1;

    IF v_min IS NULL OR v_max IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_sort >= LEAST(v_min, v_max)
       AND v_sort <= GREATEST(v_min, v_max);
END;
$$;
