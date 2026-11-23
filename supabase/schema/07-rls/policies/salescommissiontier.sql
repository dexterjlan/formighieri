-- Name: SalesCommissionTier SalesCommissionTier_admin_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionTier_admin_all" ON public."SalesCommissionTier" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());

-- Name: SalesCommissionTier commercial_read_sales_commission_tier; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY commercial_read_sales_commission_tier ON public."SalesCommissionTier" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());
