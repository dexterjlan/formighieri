-- Name: SalesMonthlyTarget SalesMonthlyTarget_admin_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesMonthlyTarget_admin_all" ON public."SalesMonthlyTarget" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());

-- Name: SalesMonthlyTarget commercial_read_sales_monthly_target; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY commercial_read_sales_monthly_target ON public."SalesMonthlyTarget" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());
