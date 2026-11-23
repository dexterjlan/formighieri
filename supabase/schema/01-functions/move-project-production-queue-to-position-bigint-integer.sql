-- Name: move_project_production_queue_to_position(bigint, integer); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.move_project_production_queue_to_position(p_order_project_id bigint, p_sequence integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_current public."ProjectProductionQueue"%ROWTYPE;
    v_user_id bigint;
    v_max integer;
    v_target integer;
BEGIN
    IF NOT public.can_manage_project_production_queue() THEN
        RAISE EXCEPTION 'Sem permissão para reordenar a fila de programações.';
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

    SELECT COUNT(*)::integer
    INTO v_max
    FROM public."ProjectProductionQueue";

    IF v_max < 1 THEN
        RETURN false;
    END IF;

    v_target := GREATEST(1, LEAST(COALESCE(p_sequence, v_current.sequence), v_max));
    IF v_target = v_current.sequence THEN
        RETURN false;
    END IF;

    SELECT id
    INTO v_user_id
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
    LIMIT 1;

    IF v_target < v_current.sequence THEN
        UPDATE public."ProjectProductionQueue"
        SET sequence = sequence + 1,
            "updatedAt" = now(),
            "updatedById" = v_user_id
        WHERE sequence >= v_target
          AND sequence < v_current.sequence;
    ELSE
        UPDATE public."ProjectProductionQueue"
        SET sequence = sequence - 1,
            "updatedAt" = now(),
            "updatedById" = v_user_id
        WHERE sequence > v_current.sequence
          AND sequence <= v_target;
    END IF;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_target,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_current.id;

    PERFORM public.compact_project_production_queue();
    RETURN true;
END;
$$;
