-- Name: allocate_aggregator_order_project_code(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.allocate_aggregator_order_project_code() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT nextval('public."OrderProjectAggregatorCode_seq"')::text;
$$;
