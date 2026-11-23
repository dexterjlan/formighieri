-- Name: ExpeditionVolume authenticated_delete_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExpeditionVolume" ON public."ExpeditionVolume" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExpeditionVolume authenticated_insert_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExpeditionVolume" ON public."ExpeditionVolume" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExpeditionVolume authenticated_select_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExpeditionVolume" ON public."ExpeditionVolume" FOR SELECT TO authenticated USING (true);

-- Name: ExpeditionVolume authenticated_update_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExpeditionVolume" ON public."ExpeditionVolume" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
