-- Name: log_order_project_status_change(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.log_order_project_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
    previous_started_at timestamptz;
    duration_seconds bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF TG_OP = 'INSERT' THEN
        IF NEW."statusId" IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO public."OrderProjectStatusHistory" (
            "orderProjectId",
            "previousStatusId",
            "newStatusId",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            NULL,
            NEW."statusId",
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."statusId" IS NOT DISTINCT FROM OLD."statusId" THEN
            RETURN NEW;
        END IF;

        IF NEW."statusId" IS NULL THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        IF OLD."statusId" IS NOT NULL THEN
            SELECT COALESCE(
                (
                    SELECT h."changedAt"
                    FROM public."OrderProjectStatusHistory" h
                    WHERE h."orderProjectId" = NEW.id
                      AND h."newStatusId" IS NOT DISTINCT FROM OLD."statusId"
                    ORDER BY h."changedAt" DESC
                    LIMIT 1
                ),
                OLD."createdAt"
            )
            INTO previous_started_at;

            duration_seconds := GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (changed_at - previous_started_at)))::bigint
            );
        ELSE
            duration_seconds := NULL;
        END IF;

        INSERT INTO public."OrderProjectStatusHistory" (
            "orderProjectId",
            "previousStatusId",
            "newStatusId",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            OLD."statusId",
            NEW."statusId",
            changed_at,
            changed_by,
            duration_seconds
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;
