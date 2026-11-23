-- Name: EnvironmentType authenticated_delete_EnvironmentType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_EnvironmentType" ON public."EnvironmentType" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: EnvironmentType authenticated_insert_EnvironmentType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_EnvironmentType" ON public."EnvironmentType" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: EnvironmentType authenticated_select_EnvironmentType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_EnvironmentType" ON public."EnvironmentType" FOR SELECT TO authenticated USING (true);

-- Name: EnvironmentType authenticated_update_EnvironmentType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_EnvironmentType" ON public."EnvironmentType" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
