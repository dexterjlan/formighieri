-- Name: currentAppUserId(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public."currentAppUserId"() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT id FROM public."appUsers" WHERE "authId" = auth.uid() LIMIT 1;
$$;
