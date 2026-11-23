-- Name: SalesCommissionEntry SalesCommissionEntry_admin_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionEntry_admin_all" ON public."SalesCommissionEntry" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());

-- Name: SalesCommissionEntry commercial_read_own_sales_commission_entry; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY commercial_read_own_sales_commission_entry ON public."SalesCommissionEntry" FOR SELECT TO authenticated USING ((public."canReadCommercialCommissions"() AND ("consultantUserId" = public."currentAppUserId"())));
