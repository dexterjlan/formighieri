-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_manager_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionSaleInstallment_manager_all" ON public."SalesCommissionSaleInstallment" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());
