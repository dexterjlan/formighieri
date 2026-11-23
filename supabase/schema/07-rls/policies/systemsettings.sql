-- Name: SystemSettings admin_insert_SystemSettings; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "admin_insert_SystemSettings" ON public."SystemSettings" FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

-- Name: SystemSettings admin_update_SystemSettings; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "admin_update_SystemSettings" ON public."SystemSettings" FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

-- Name: SystemSettings authenticated_select_SystemSettings; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_SystemSettings" ON public."SystemSettings" FOR SELECT TO authenticated USING (true);
