-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_admin_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesOrderClientInstallment_admin_all" ON public."SalesOrderClientInstallment" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());
