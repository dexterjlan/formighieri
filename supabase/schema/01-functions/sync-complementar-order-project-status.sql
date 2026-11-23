-- Name: sync_complementar_order_project_status(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.sync_complementar_order_project_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE'
        AND NEW."statusId" IS DISTINCT FROM OLD."statusId" THEN
        UPDATE "OrderProject"
        SET
            "statusId" = NEW."statusId",
            "updatedAt" = COALESCE(NEW."updatedAt", now()),
            "updatedById" = NEW."updatedById"
        WHERE "parentProjectId" = NEW.id
          AND "isComplementary" = true;
    END IF;

    RETURN NEW;
END;
$$;
