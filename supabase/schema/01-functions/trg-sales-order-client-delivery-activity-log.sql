-- Name: trg_sales_order_client_delivery_activity_log(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.trg_sales_order_client_delivery_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF NEW."clientDeliveryDate" IS NOT DISTINCT FROM OLD."clientDeliveryDate" THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    PERFORM public.insert_activity_log_row(
        'SalesOrder',
        NEW.id,
        'sales_order.client_delivery_date_changed',
        'clientDeliveryDate',
        public.activity_log_value_json(
            to_jsonb(OLD."clientDeliveryDate"),
            public.format_activity_log_date_br(OLD."clientDeliveryDate")
        ),
        public.activity_log_value_json(
            to_jsonb(NEW."clientDeliveryDate"),
            public.format_activity_log_date_br(NEW."clientDeliveryDate")
        ),
        v_changed_by,
        jsonb_build_object('orderCode', NEW."orderCode"),
        NULL,
        NEW.id
    );

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;
