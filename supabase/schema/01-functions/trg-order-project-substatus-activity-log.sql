-- Name: trg_order_project_substatus_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_order_project_substatus_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_label text;
    v_meta jsonb;
    v_started_display text;
    v_ended_display text;
    v_note text;
BEGIN
    v_label := public.activity_log_order_project_substatus_kind_label(NEW.kind);
    v_note := NULLIF(trim(COALESCE(NEW.note, '')), '');
    v_meta := jsonb_build_object(
        'substatusKind', NEW.kind,
        'substatusLabel', v_label
    );
    IF v_note IS NOT NULL THEN
        v_meta := v_meta || jsonb_build_object('note', v_note);
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_changed_by := public.resolve_activity_log_changed_by_id(NEW."startedById");
        v_started_display := to_char(
            NEW."startedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'OrderProjectSubstatus',
            NEW.id,
            'order_project_substatus.started',
            'startedAt',
            public.activity_log_value_json(NULL::jsonb, '—'),
            public.activity_log_value_json(to_jsonb(NEW.kind), v_label || ' · ' || v_started_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
        AND OLD."endedAt" IS NULL
        AND NEW."endedAt" IS NOT NULL THEN
        v_changed_by := public.resolve_activity_log_changed_by_id(NEW."endedById");
        v_started_display := to_char(
            NEW."startedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );
        v_ended_display := to_char(
            NEW."endedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'OrderProjectSubstatus',
            NEW.id,
            'order_project_substatus.ended',
            'endedAt',
            public.activity_log_value_json(to_jsonb(OLD."endedAt"), 'Em aberto desde ' || v_started_display),
            public.activity_log_value_json(to_jsonb(NEW."endedAt"), 'Encerrado em ' || v_ended_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;
