-- Name: trg_part_request_status_history(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_part_request_status_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    prev_changed_at timestamptz;
    duration_sec integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."PartRequestStatusHistory" (
            "partRequestId", "previousStatus", "newStatus", "changedById"
        ) VALUES (
            NEW.id, NULL, NEW.status, NEW."createdById"
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        SELECT h."changedAt" INTO prev_changed_at
        FROM public."PartRequestStatusHistory" h
        WHERE h."partRequestId" = NEW.id
        ORDER BY h."changedAt" DESC, h.id DESC
        LIMIT 1;

        IF prev_changed_at IS NOT NULL THEN
            duration_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - prev_changed_at))::integer);
        END IF;

        INSERT INTO public."PartRequestStatusHistory" (
            "partRequestId",
            "previousStatus",
            "newStatus",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW."updatedById",
            duration_sec
        );
    END IF;

    RETURN NEW;
END;
$$;
