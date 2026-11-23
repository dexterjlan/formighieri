-- Name: log_related_designer_change(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.log_related_designer_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    source_type text := TG_ARGV[0];
    source_label text;
    changed_at timestamptz;
    changed_by bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF source_type = 'thirdParty' THEN
        SELECT st.name
        INTO source_label
        FROM public."ThirdPartySubtype" st
        WHERE st.id = NEW."thirdPartySubtypeId";
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW."designerId" IS NULL THEN
            RETURN NEW;
        END IF;

        PERFORM public.insert_order_project_designer_history(
            NEW."orderProjectId",
            source_type,
            NEW.id,
            source_label,
            NULL,
            NEW."designerId",
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."designerId" IS NOT DISTINCT FROM OLD."designerId" THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        PERFORM public.insert_order_project_designer_history(
            NEW."orderProjectId",
            source_type,
            NEW.id,
            source_label,
            OLD."designerId",
            NEW."designerId",
            changed_at,
            changed_by,
            CASE
                WHEN OLD."designerId" IS NULL THEN NULL
                ELSE public.latest_designer_history_started_at(
                    NEW."orderProjectId",
                    source_type,
                    NEW.id,
                    OLD."designerId",
                    OLD."createdAt"
                )
            END
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;
