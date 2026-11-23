-- Name: FactoryRole authenticated_delete_FactoryRole; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_FactoryRole" ON public."FactoryRole" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: FactoryRole authenticated_insert_FactoryRole; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_FactoryRole" ON public."FactoryRole" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: FactoryRole authenticated_select_FactoryRole; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_FactoryRole" ON public."FactoryRole" FOR SELECT TO authenticated USING (true);

-- Name: FactoryRole authenticated_update_FactoryRole; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_FactoryRole" ON public."FactoryRole" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
