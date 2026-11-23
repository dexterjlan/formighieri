-- Name: set_sales_order_commission_fields(bigint, text, integer, boolean, boolean, numeric, boolean); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_sales_order_commission_fields(p_order_id bigint, p_payment_method text, p_installment_count integer, p_commission_confirmed boolean, p_commission_counts_for_tier boolean DEFAULT NULL::boolean, p_commission_rate_override numeric DEFAULT NULL::numeric, p_clear_commission_rate_override boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public."salesOrders"
    SET
        "paymentMethod" = p_payment_method,
        "installmentCount" = GREATEST(1, COALESCE(p_installment_count, 1)),
        "commissionConfirmed" = COALESCE(p_commission_confirmed, false),
        "commissionCountsForTier" = COALESCE(p_commission_counts_for_tier, "commissionCountsForTier", true),
        "commissionRateOverride" = CASE
            WHEN p_clear_commission_rate_override THEN NULL
            WHEN p_commission_rate_override IS NOT NULL THEN p_commission_rate_override
            ELSE "commissionRateOverride"
        END,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;
