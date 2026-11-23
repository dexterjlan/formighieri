-- Name: PurchaseReason authenticated_delete_PurchaseReason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_PurchaseReason" ON public."PurchaseReason" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PurchaseReason authenticated_insert_PurchaseReason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_PurchaseReason" ON public."PurchaseReason" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PurchaseReason authenticated_select_PurchaseReason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_PurchaseReason" ON public."PurchaseReason" FOR SELECT TO authenticated USING (true);

-- Name: PurchaseReason authenticated_update_PurchaseReason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_PurchaseReason" ON public."PurchaseReason" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
