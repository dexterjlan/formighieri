-- Name: SalesCommissionManagerTier SalesCommissionManagerTier_manager_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionManagerTier_manager_all" ON public."SalesCommissionManagerTier" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());

-- Name: SalesCommissionManagerTier commercial_read_sales_commission_manager_tier; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY commercial_read_sales_commission_manager_tier ON public."SalesCommissionManagerTier" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());
