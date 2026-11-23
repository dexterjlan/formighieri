-- Name: trg_revision_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_revision_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_meta jsonb;
    v_action text;
    v_started_display text;
    v_completed_display text;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(COALESCE(NEW."updatedById", NEW."createdById"));
    v_meta := jsonb_build_object('revisionType', NEW."revisionType");

    IF OLD."revisionStartedAt" IS NULL AND NEW."revisionStartedAt" IS NOT NULL THEN
        v_action := 'revision.started';
        IF NEW."revisionType" = 'commercial_technical' THEN
            v_action := 'revision.designer_started';
        ELSIF NEW."revisionType" = 'technical_reviewer' THEN
            v_action := 'revision.reviewer_started';
        ELSIF NEW."revisionType" = 'commercial_commercial' THEN
            v_action := 'revision.consultor_revision_started';
        ELSIF NEW."revisionType" = 'third_party' THEN
            v_action := 'revision.third_party_started';
        END IF;

        v_started_display := to_char(
            NEW."revisionStartedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            v_action,
            'revisionStartedAt',
            public.activity_log_value_json(to_jsonb(OLD."revisionStartedAt"), '—'),
            public.activity_log_value_json(to_jsonb(NEW."revisionStartedAt"), v_started_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    IF OLD."revisionCompletedAt" IS NULL AND NEW."revisionCompletedAt" IS NOT NULL THEN
        v_action := 'revision.completed';
        IF NEW."revisionType" = 'commercial_technical' THEN
            v_action := 'revision.designer_completed';
        ELSIF NEW."revisionType" = 'technical_reviewer' THEN
            v_action := 'revision.reviewer_completed';
        ELSIF NEW."revisionType" = 'commercial_commercial' THEN
            v_action := 'revision.consultor_revision_completed';
        ELSIF NEW."revisionType" = 'third_party' THEN
            v_action := 'revision.third_party_completed';
        END IF;

        v_completed_display := to_char(
            NEW."revisionCompletedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            v_action,
            'revisionCompletedAt',
            public.activity_log_value_json(to_jsonb(OLD."revisionCompletedAt"), '—'),
            public.activity_log_value_json(to_jsonb(NEW."revisionCompletedAt"), v_completed_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
        AND NOT (
            OLD."revisionStartedAt" IS NULL
            AND NEW."revisionStartedAt" IS NOT NULL
        )
        AND NOT (
            OLD."revisionCompletedAt" IS NULL
            AND NEW."revisionCompletedAt" IS NOT NULL
        ) THEN
        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            'revision.status_changed',
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;
