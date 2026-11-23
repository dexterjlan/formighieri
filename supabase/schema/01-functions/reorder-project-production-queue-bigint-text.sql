-- Name: reorder_project_production_queue(bigint, text); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.reorder_project_production_queue(p_order_project_id bigint, p_direction text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_direction text;
    v_current public."ProjectProductionQueue"%ROWTYPE;
    v_neighbor public."ProjectProductionQueue"%ROWTYPE;
    v_user_id bigint;
    v_temp integer;
BEGIN
    IF NOT public.can_manage_project_production_queue() THEN
        RAISE EXCEPTION 'Sem permissão para reordenar a fila de programações.';
    END IF;

    v_direction := lower(trim(COALESCE(p_direction, '')));
    IF v_direction NOT IN ('up', 'down') THEN
        RAISE EXCEPTION 'Direção inválida. Use up ou down.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ProjectProductionQueue'));

    SELECT *
    INTO v_current
    FROM public."ProjectProductionQueue"
    WHERE "orderProjectId" = p_order_project_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_direction = 'up' THEN
        SELECT *
        INTO v_neighbor
        FROM public."ProjectProductionQueue"
        WHERE sequence < v_current.sequence
        ORDER BY sequence DESC, id DESC
        LIMIT 1
        FOR UPDATE;
    ELSE
        SELECT *
        INTO v_neighbor
        FROM public."ProjectProductionQueue"
        WHERE sequence > v_current.sequence
        ORDER BY sequence ASC, id ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    SELECT id
    INTO v_user_id
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
    LIMIT 1;

    v_temp := v_current.sequence;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_neighbor.sequence,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_current.id;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_temp,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_neighbor.id;

    RETURN true;
END;
$$;
