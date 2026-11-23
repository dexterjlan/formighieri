-- Name: append_assistance_request_status_history(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.append_assistance_request_status_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    last_changed_at timestamptz;
    duration_seconds bigint;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."AssistanceRequestStatusHistory" (
            "assistanceRequestId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById"
        ) VALUES (
            NEW.id,
            NULL,
            NEW.status,
            COALESCE(NEW."createdAt", now()),
            NEW."createdById"
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    SELECT h."changedAt"
    INTO last_changed_at
    FROM public."AssistanceRequestStatusHistory" h
    WHERE h."assistanceRequestId" = NEW.id
    ORDER BY h."changedAt" DESC, h.id DESC
    LIMIT 1;

    duration_seconds := NULL;
    IF last_changed_at IS NOT NULL THEN
        duration_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (now() - last_changed_at)))::bigint
        );
    END IF;

    INSERT INTO public."AssistanceRequestStatusHistory" (
        "assistanceRequestId",
        "previousStatus",
        "newStatus",
        "changedById",
        "previousStatusDurationSeconds"
    ) VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        NEW."updatedById",
        duration_seconds
    );

    RETURN NEW;
END;
$$;
