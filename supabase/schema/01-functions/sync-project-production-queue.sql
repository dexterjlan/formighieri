-- Name: sync_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.sync_project_production_queue() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_belongs boolean;
    v_next integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('ProjectProductionQueue'));

    v_belongs := public.order_project_belongs_in_production_queue(
        NEW."statusId",
        NEW."isComplementary",
        NEW."isReplaced"
    );

    IF v_belongs THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public."ProjectProductionQueue" q
            WHERE q."orderProjectId" = NEW.id
        ) THEN
            SELECT COALESCE(MAX(sequence), 0) + 1
            INTO v_next
            FROM public."ProjectProductionQueue";

            INSERT INTO public."ProjectProductionQueue" ("orderProjectId", sequence, "updatedById")
            VALUES (NEW.id, v_next, NEW."updatedById");
        END IF;
    ELSE
        DELETE FROM public."ProjectProductionQueue"
        WHERE "orderProjectId" = NEW.id;
        IF FOUND THEN
            PERFORM public.compact_project_production_queue();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
