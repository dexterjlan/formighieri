-- Name: importConsultorWPS authenticated_delete_importConsultorWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_importConsultorWPS" ON public."importConsultorWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: importConsultorWPS authenticated_insert_importConsultorWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_importConsultorWPS" ON public."importConsultorWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: importConsultorWPS authenticated_select_importConsultorWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_importConsultorWPS" ON public."importConsultorWPS" FOR SELECT TO authenticated USING (true);

-- Name: importConsultorWPS authenticated_update_importConsultorWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_importConsultorWPS" ON public."importConsultorWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
