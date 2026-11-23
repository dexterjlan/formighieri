-- Name: importStatusWPS authenticated_delete_importStatusWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_importStatusWPS" ON public."importStatusWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: importStatusWPS authenticated_insert_importStatusWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_importStatusWPS" ON public."importStatusWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: importStatusWPS authenticated_select_importStatusWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_importStatusWPS" ON public."importStatusWPS" FOR SELECT TO authenticated USING (true);

-- Name: importStatusWPS authenticated_update_importStatusWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_importStatusWPS" ON public."importStatusWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
