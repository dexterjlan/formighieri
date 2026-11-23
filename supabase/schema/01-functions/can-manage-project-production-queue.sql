-- Name: can_manage_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.can_manage_project_production_queue() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND COALESCE(u."isActive", true) = true
          AND (
              u.role = 'Admin'
              OR ((u.role IN ('Admin', 'Projetista')) AND COALESCE(u."isProjectsManager", false))
              OR ((u.role IN ('Admin', 'Consultor')) AND COALESCE(u."isCommercialManager", false))
              OR (u.role = 'Marceneiro' AND COALESCE(u."isFactoryManager", false))
          )
    );
$$;
