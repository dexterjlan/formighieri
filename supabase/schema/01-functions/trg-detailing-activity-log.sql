-- Name: trg_detailing_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_detailing_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_old_designer_name text;
    v_new_designer_name text;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(
        CASE WHEN TG_OP = 'INSERT' THEN NEW."createdById" ELSE NEW."updatedById" END
    );

    IF TG_OP = 'INSERT' THEN
        PERFORM public.insert_activity_log_row(
            'Detailing',
            NEW.id,
            'detailing.created',
            'status',
            NULL,
            public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'Detalhamento' AND OLD.status = 'Aguardando Detalhamento' THEN
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.started',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                jsonb_build_object('startedAt', NEW."startedAt"),
                NEW."orderProjectId",
                NULL
            );
        ELSIF NEW.status = 'Pronto' THEN
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.completed',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                jsonb_build_object('completedAt', NEW."completedAt"),
                NEW."orderProjectId",
                NULL
            );
        ELSE
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.status_changed',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                NULL,
                NEW."orderProjectId",
                NULL
            );
        END IF;
    END IF;

    IF NEW."designerId" IS DISTINCT FROM OLD."designerId" AND NEW."designerId" IS NOT NULL THEN
        SELECT name INTO v_old_designer_name FROM public."appUsers" WHERE id = OLD."designerId";
        SELECT name INTO v_new_designer_name FROM public."appUsers" WHERE id = NEW."designerId";

        PERFORM public.insert_activity_log_row(
            'Detailing',
            NEW.id,
            'detailing.designer_assigned',
            'designerId',
            public.activity_log_value_json(to_jsonb(OLD."designerId"), COALESCE(v_old_designer_name, '—')),
            public.activity_log_value_json(to_jsonb(NEW."designerId"), COALESCE(v_new_designer_name, NEW."designerId"::text)),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;
