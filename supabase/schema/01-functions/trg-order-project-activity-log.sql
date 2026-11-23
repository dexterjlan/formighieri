-- Name: trg_order_project_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_order_project_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_old_status_name text;
    v_new_status_name text;
    v_old_maker_name text;
    v_new_maker_name text;
    v_old_designer_name text;
    v_new_designer_name text;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    IF NEW."statusId" IS DISTINCT FROM OLD."statusId" THEN
        SELECT name INTO v_old_status_name FROM public."OrderProjectStatus" WHERE id = OLD."statusId";
        SELECT name INTO v_new_status_name FROM public."OrderProjectStatus" WHERE id = NEW."statusId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.status_changed',
            'statusId',
            public.activity_log_value_json(to_jsonb(OLD."statusId"), COALESCE(v_old_status_name, OLD."statusId"::text)),
            public.activity_log_value_json(to_jsonb(NEW."statusId"), COALESCE(v_new_status_name, NEW."statusId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."internalAssemblyStartDate" IS DISTINCT FROM OLD."internalAssemblyStartDate" THEN
        IF OLD."internalAssemblyStartDate" IS NULL AND NEW."internalAssemblyStartDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_started',
                'internalAssemblyStartDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyStartDate"), '—'),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyStartDate"), NEW."internalAssemblyStartDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        ELSIF OLD."internalAssemblyStartDate" IS NOT NULL
            AND NEW."internalAssemblyStartDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_start_date_changed',
                'internalAssemblyStartDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyStartDate"), OLD."internalAssemblyStartDate"::text),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyStartDate"), NEW."internalAssemblyStartDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        END IF;
    END IF;

    IF NEW."internalAssemblyEndDate" IS DISTINCT FROM OLD."internalAssemblyEndDate" THEN
        IF OLD."internalAssemblyEndDate" IS NULL AND NEW."internalAssemblyEndDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_finished',
                'internalAssemblyEndDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyEndDate"), '—'),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyEndDate"), NEW."internalAssemblyEndDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        ELSIF OLD."internalAssemblyEndDate" IS NOT NULL
            AND NEW."internalAssemblyEndDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_end_date_changed',
                'internalAssemblyEndDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyEndDate"), OLD."internalAssemblyEndDate"::text),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyEndDate"), NEW."internalAssemblyEndDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        END IF;
    END IF;

    IF NEW."cabinetMakerId" IS DISTINCT FROM OLD."cabinetMakerId" AND NEW."cabinetMakerId" IS NOT NULL THEN
        SELECT name INTO v_old_maker_name FROM public."CabinetMaker" WHERE id = OLD."cabinetMakerId";
        SELECT name INTO v_new_maker_name FROM public."CabinetMaker" WHERE id = NEW."cabinetMakerId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.cabinet_maker_assigned',
            'cabinetMakerId',
            public.activity_log_value_json(to_jsonb(OLD."cabinetMakerId"), COALESCE(v_old_maker_name, OLD."cabinetMakerId"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."cabinetMakerId"), COALESCE(v_new_maker_name, NEW."cabinetMakerId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."designerId" IS DISTINCT FROM OLD."designerId" AND NEW."designerId" IS NOT NULL THEN
        SELECT name INTO v_old_designer_name FROM public."appUsers" WHERE id = OLD."designerId";
        SELECT name INTO v_new_designer_name FROM public."appUsers" WHERE id = NEW."designerId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.designer_assigned',
            'designerId',
            public.activity_log_value_json(to_jsonb(OLD."designerId"), COALESCE(v_old_designer_name, '—')),
            public.activity_log_value_json(to_jsonb(NEW."designerId"), COALESCE(v_new_designer_name, NEW."designerId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."deliveryDate" IS DISTINCT FROM OLD."deliveryDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.delivery_date_changed',
            'deliveryDate',
            public.activity_log_value_json(to_jsonb(OLD."deliveryDate"), COALESCE(OLD."deliveryDate"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."deliveryDate"), COALESCE(NEW."deliveryDate"::text, '—')),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."productionMonth" IS DISTINCT FROM OLD."productionMonth" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.production_month_changed',
            'productionMonth',
            public.activity_log_value_json(to_jsonb(OLD."productionMonth"), COALESCE(OLD."productionMonth"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."productionMonth"), COALESCE(NEW."productionMonth"::text, '—')),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."technicalProjectForecastStartDate" IS DISTINCT FROM OLD."technicalProjectForecastStartDate"
        OR NEW."technicalProjectForecastEndDate" IS DISTINCT FROM OLD."technicalProjectForecastEndDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.technical_forecast_changed',
            'technicalProjectForecast',
            public.activity_log_value_json(
                jsonb_build_object(
                    'start', OLD."technicalProjectForecastStartDate",
                    'end', OLD."technicalProjectForecastEndDate"
                ),
                trim(both ' · ' from concat_ws(
                    ' · ',
                    CASE WHEN OLD."technicalProjectForecastStartDate" IS NOT NULL
                        THEN 'Início: ' || OLD."technicalProjectForecastStartDate"::text ELSE NULL END,
                    CASE WHEN OLD."technicalProjectForecastEndDate" IS NOT NULL
                        THEN 'Fim: ' || OLD."technicalProjectForecastEndDate"::text ELSE NULL END
                ))
            ),
            public.activity_log_value_json(
                jsonb_build_object(
                    'start', NEW."technicalProjectForecastStartDate",
                    'end', NEW."technicalProjectForecastEndDate"
                ),
                trim(both ' · ' from concat_ws(
                    ' · ',
                    CASE WHEN NEW."technicalProjectForecastStartDate" IS NOT NULL
                        THEN 'Início: ' || NEW."technicalProjectForecastStartDate"::text ELSE NULL END,
                    CASE WHEN NEW."technicalProjectForecastEndDate" IS NOT NULL
                        THEN 'Fim: ' || NEW."technicalProjectForecastEndDate"::text ELSE NULL END
                ))
            ),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;
