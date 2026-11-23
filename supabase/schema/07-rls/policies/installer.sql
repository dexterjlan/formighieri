-- Name: Installer authenticated_delete_Montador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Montador" ON public."Installer" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: Installer authenticated_insert_Montador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Montador" ON public."Installer" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: Installer authenticated_select_Montador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Montador" ON public."Installer" FOR SELECT TO authenticated USING (true);

-- Name: Installer authenticated_update_Montador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Montador" ON public."Installer" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
