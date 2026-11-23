-- Name: resolve_activity_log_order_context(text, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.resolve_activity_log_order_context(p_entity_type text, p_entity_id bigint, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS TABLE("orderProjectId" bigint, "orderId" bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_order_project_id bigint;
    v_order_id bigint;
BEGIN
    v_order_project_id := p_order_project_id;
    v_order_id := p_order_id;

    IF p_entity_type = 'OrderProject' THEN
        v_order_project_id := COALESCE(v_order_project_id, p_entity_id);
        SELECT op."orderId" INTO v_order_id
        FROM public."OrderProject" op
        WHERE op.id = v_order_project_id;
    ELSIF p_entity_type = 'Detailing' THEN
        SELECT d."orderProjectId" INTO v_order_project_id
        FROM public."Detailing" d
        WHERE d.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'Revision' THEN
        SELECT r."orderProjectId" INTO v_order_project_id
        FROM public."Revision" r
        WHERE r.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'Implementation' THEN
        SELECT i."orderProjectId" INTO v_order_project_id
        FROM public."Implementation" i
        WHERE i.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'PreliminaryDesignConference' THEN
        SELECT c."orderId" INTO v_order_id
        FROM public."PreliminaryDesignConference" c
        WHERE c.id = p_entity_id;
    ELSIF p_entity_type = 'Measurement' THEN
        SELECT m."orderId" INTO v_order_id
        FROM public."Measurement" m
        WHERE m.id = p_entity_id;
    ELSIF p_entity_type = 'OrderRequest' THEN
        SELECT r."orderProjectId" INTO v_order_project_id
        FROM public."OrderRequest" r
        WHERE r.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'SalesOrder' THEN
        v_order_id := p_entity_id;
    ELSIF p_entity_type = 'OrderDeliveryPhase' THEN
        SELECT p."orderId" INTO v_order_id
        FROM public."OrderDeliveryPhase" p
        WHERE p.id = p_entity_id;
    END IF;

    "orderProjectId" := v_order_project_id;
    "orderId" := v_order_id;
    RETURN NEXT;
END;
$$;
