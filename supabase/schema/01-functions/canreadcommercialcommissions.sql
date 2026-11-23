-- Name: canReadCommercialCommissions(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public."canReadCommercialCommissions"() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u."isActive" IS DISTINCT FROM false
          AND (
              u.role = 'Admin'
              OR u.role = 'Consultor'
              OR u."isCommercialManager" = true
          )
    );
$$;
