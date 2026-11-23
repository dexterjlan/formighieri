-- Name: trg_implementation_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_implementation_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_action text;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(
        CASE WHEN TG_OP = 'INSERT' THEN NEW."createdById" ELSE NEW."updatedById" END
    );

    IF TG_OP = 'INSERT' THEN
        PERFORM public.insert_activity_log_row(
            'Implementation',
            NEW.id,
            'implementation.created',
            'status',
            NULL,
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, 'Aberto')),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        v_action := 'implementation.status_changed';
        IF NEW.status = 'Enviado para Produção' THEN
            v_action := 'implementation.sent_to_production';
        ELSIF NEW.status = 'Encerrado' THEN
            v_action := 'implementation.closed';
        END IF;

        PERFORM public.insert_activity_log_row(
            'Implementation',
            NEW.id,
            v_action,
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;
