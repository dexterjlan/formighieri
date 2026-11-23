-- Name: SalesCommissionSale SalesCommissionSale_manager_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionSale_manager_all" ON public."SalesCommissionSale" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());
