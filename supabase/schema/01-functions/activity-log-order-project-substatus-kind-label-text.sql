-- Name: activity_log_order_project_substatus_kind_label(text); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.activity_log_order_project_substatus_kind_label(p_kind text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE p_kind
        WHEN 'AwaitingRequest' THEN 'Aguardando Requisição'
        WHEN 'InternalAssemblyAwaiting' THEN 'Aguardando'
        WHEN 'InternalAssemblyPainting' THEN 'Pintura'
        WHEN 'InternalAssemblyMetalwork' THEN 'Serralheria'
        WHEN 'InternalAssemblyUpholstery' THEN 'Estofado'
        WHEN 'InternalAssemblyGlass' THEN 'Vidros'
        WHEN 'InternalAssemblyAwaitingHardware' THEN 'Aguardando Ferragens'
        ELSE COALESCE(NULLIF(trim(p_kind), ''), 'Substatus')
    END;
$$;
