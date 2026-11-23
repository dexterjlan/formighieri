-- Name: set_sales_order_architect_id(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_sales_order_architect_id(p_order_id bigint, p_architect_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "architectId" = p_architect_id,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;
