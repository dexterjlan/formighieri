-- Name: set_order_project_status_with_observation(bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_order_project_status_with_observation(p_order_project_id bigint, p_status_id bigint, p_observation text, p_updated_by_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF p_order_project_id IS NULL OR p_status_id IS NULL THEN
        RAISE EXCEPTION 'Projeto e status são obrigatórios.';
    END IF;

    UPDATE public."OrderProject"
    SET
        "statusId" = p_status_id,
        "updatedById" = p_updated_by_id,
        "updatedAt" = now()
    WHERE id = p_order_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Projeto não encontrado.';
    END IF;

    UPDATE public."OrderProjectStatusHistory"
    SET observation = nullif(btrim(coalesce(p_observation, '')), '')
    WHERE id = (
        SELECT h.id
        FROM public."OrderProjectStatusHistory" AS h
        WHERE h."orderProjectId" = p_order_project_id
        ORDER BY h."changedAt" DESC, h.id DESC
        LIMIT 1
    );

    RETURN true;
END;
$$;
