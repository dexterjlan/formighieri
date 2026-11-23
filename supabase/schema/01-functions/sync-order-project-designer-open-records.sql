-- Name: sync_order_project_designer_open_records(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.sync_order_project_designer_open_records() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NEW."designerId" IS NULL
        OR NEW."designerId" IS NOT DISTINCT FROM OLD."designerId" THEN
        RETURN NEW;
    END IF;

    UPDATE public."OrderRequest" req
    SET
        "designerId" = NEW."designerId",
        "updatedAt" = COALESCE(NEW."updatedAt", now()),
        "updatedById" = COALESCE(NEW."updatedById", req."updatedById")
    WHERE req."designerId" IS DISTINCT FROM NEW."designerId"
      AND req.status <> 'Encerrado'
      AND req."orderProjectId" = NEW.id;

    RETURN NEW;
END;
$$;
