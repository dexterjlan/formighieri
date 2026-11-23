-- Name: log_third_party_project_status_change(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.log_third_party_project_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
    previous_started_at timestamptz;
    duration_seconds bigint;
    history_observation text;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    history_observation := NULL;
    IF NEW.status = 'Canceled' THEN
        history_observation := NULLIF(trim(NEW."cancelObservation"), '');
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."ThirdPartyProjectStatusHistory" (
            "thirdPartyProjectId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds",
            observation
        ) VALUES (
            NEW.id,
            NULL,
            NEW.status,
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL,
            history_observation
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        IF OLD.status IS NOT NULL THEN
            SELECT COALESCE(
                (
                    SELECT h."changedAt"
                    FROM public."ThirdPartyProjectStatusHistory" h
                    WHERE h."thirdPartyProjectId" = NEW.id
                      AND h."newStatus" IS NOT DISTINCT FROM OLD.status
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

        INSERT INTO public."ThirdPartyProjectStatusHistory" (
            "thirdPartyProjectId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds",
            observation
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            changed_at,
            changed_by,
            duration_seconds,
            history_observation
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;
