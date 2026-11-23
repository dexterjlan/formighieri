-- Name: trg_measurement_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_measurement_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."createdById");

    PERFORM public.insert_activity_log_row(
        'Measurement',
        NEW.id,
        'measurement.created',
        NULL,
        NULL,
        public.activity_log_value_json(to_jsonb(NEW.id), 'Medição registrada'),
        v_changed_by,
        NULL,
        NULL,
        NEW."orderId"
    );

    RETURN NEW;
END;
$$;
