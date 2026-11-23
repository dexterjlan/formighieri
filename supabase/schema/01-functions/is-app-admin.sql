-- Name: is_app_admin(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.is_app_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u.role = 'Admin'
          AND u."isActive" = true
    );
$$;
