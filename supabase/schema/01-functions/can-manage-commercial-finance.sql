-- Name: can_manage_commercial_finance(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.can_manage_commercial_finance() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u."isActive" = true
          AND (
              u.role = 'Admin'
              OR (u.role = 'Consultor' AND u."isCommercialManager" = true)
          )
    );
$$;
