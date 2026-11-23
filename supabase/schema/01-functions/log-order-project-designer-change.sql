-- Name: log_order_project_designer_change(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.log_order_project_designer_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF TG_OP = 'INSERT' THEN
        IF NEW."designerId" IS NULL THEN
            RETURN NEW;
        END IF;

        PERFORM public.insert_order_project_designer_history(
            NEW.id,
            'project',
            NEW.id,
            NULL,
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
            NEW.id,
            'project',
            NEW.id,
            NULL,
            OLD."designerId",
            NEW."designerId",
            changed_at,
            changed_by,
            CASE
                WHEN OLD."designerId" IS NULL THEN NULL
                ELSE public.latest_designer_history_started_at(
                    NEW.id, 'project', NEW.id, OLD."designerId", OLD."createdAt"
                )
            END
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;
