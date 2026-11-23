-- Name: set_sales_order_client_delivery_date(bigint, date); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_sales_order_client_delivery_date(p_order_id bigint, p_client_delivery_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "clientDeliveryDate" = p_client_delivery_date,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;
