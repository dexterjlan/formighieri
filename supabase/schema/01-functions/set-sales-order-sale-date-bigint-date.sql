-- Name: set_sales_order_sale_date(bigint, date); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_sales_order_sale_date(p_order_id bigint, p_sale_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "saleDate" = p_sale_date,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;
