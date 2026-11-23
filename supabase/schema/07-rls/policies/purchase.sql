-- Name: Purchase authenticated_delete_Compras; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Compras" ON public."Purchase" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: Purchase authenticated_insert_Compras; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Compras" ON public."Purchase" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: Purchase authenticated_select_Compras; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Compras" ON public."Purchase" FOR SELECT TO authenticated USING (true);

-- Name: Purchase authenticated_update_Compras; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Compras" ON public."Purchase" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
