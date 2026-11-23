-- Name: trg_preliminary_design_conference_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_preliminary_design_conference_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.insert_activity_log_row(
            'PreliminaryDesignConference',
            NEW.id,
            'preliminary_design_conference.status_changed',
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            NULL,
            NULL,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;
