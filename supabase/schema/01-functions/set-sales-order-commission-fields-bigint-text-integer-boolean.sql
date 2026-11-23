-- Name: set_sales_order_commission_fields(bigint, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_sales_order_commission_fields(p_order_id bigint, p_payment_method text, p_installment_count integer, p_commission_confirmed boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u.role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    IF p_payment_method IS NOT NULL
       AND p_payment_method NOT IN ('cash', 'installment') THEN
        RAISE EXCEPTION 'Forma de pagamento inválida';
    END IF;

    UPDATE public."salesOrders"
    SET
        "paymentMethod" = p_payment_method,
        "installmentCount" = GREATEST(COALESCE(p_installment_count, 1), 1),
        "commissionConfirmed" = COALESCE(p_commission_confirmed, false),
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;
