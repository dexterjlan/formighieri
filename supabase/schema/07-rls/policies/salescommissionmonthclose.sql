-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_admin_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionMonthClose_admin_all" ON public."SalesCommissionMonthClose" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());
