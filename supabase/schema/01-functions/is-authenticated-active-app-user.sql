-- Name: is_authenticated_active_app_user(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.is_authenticated_active_app_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
      AND COALESCE("isActive", true) = true
  );
$$;
