-- Name: ExpeditionRoute authenticated_delete_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExpeditionRoute" ON public."ExpeditionRoute" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExpeditionRoute authenticated_insert_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExpeditionRoute" ON public."ExpeditionRoute" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExpeditionRoute authenticated_select_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExpeditionRoute" ON public."ExpeditionRoute" FOR SELECT TO authenticated USING (true);

-- Name: ExpeditionRoute authenticated_update_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExpeditionRoute" ON public."ExpeditionRoute" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
