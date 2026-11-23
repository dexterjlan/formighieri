-- Name: trg_order_delivery_phase_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_order_delivery_phase_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_meta jsonb;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(NULL);
    v_meta := jsonb_build_object(
        'phaseName', COALESCE(NEW.name, OLD.name),
        'phaseId', NEW.id,
        'sortOrder', COALESCE(NEW."sortOrder", OLD."sortOrder"),
        'orderCode', COALESCE(NEW."orderCode", OLD."orderCode")
    );

    IF TG_OP = 'INSERT' THEN
        IF NEW."deliveryDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderDeliveryPhase',
                NEW.id,
                'order_delivery_phase.delivery_date_changed',
                'deliveryDate',
                public.activity_log_value_json(to_jsonb(NULL::date), '—'),
                public.activity_log_value_json(
                    to_jsonb(NEW."deliveryDate"),
                    public.format_activity_log_date_br(NEW."deliveryDate")
                ),
                v_changed_by,
                v_meta,
                NULL,
                NEW."orderId"
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
        AND NEW."deliveryDate" IS DISTINCT FROM OLD."deliveryDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderDeliveryPhase',
            NEW.id,
            'order_delivery_phase.delivery_date_changed',
            'deliveryDate',
            public.activity_log_value_json(
                to_jsonb(OLD."deliveryDate"),
                public.format_activity_log_date_br(OLD."deliveryDate")
            ),
            public.activity_log_value_json(
                to_jsonb(NEW."deliveryDate"),
                public.format_activity_log_date_br(NEW."deliveryDate")
            ),
            v_changed_by,
            v_meta,
            NULL,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;
