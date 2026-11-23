-- Name: PurchaseStatus authenticated_delete_CompraStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_CompraStatus" ON public."PurchaseStatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PurchaseStatus authenticated_insert_CompraStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_CompraStatus" ON public."PurchaseStatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PurchaseStatus authenticated_select_CompraStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_CompraStatus" ON public."PurchaseStatus" FOR SELECT TO authenticated USING (true);

-- Name: PurchaseStatus authenticated_update_CompraStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_CompraStatus" ON public."PurchaseStatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
