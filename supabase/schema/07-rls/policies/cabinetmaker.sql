-- Name: CabinetMaker authenticated_delete_Marceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Marceneiro" ON public."CabinetMaker" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: CabinetMaker authenticated_insert_Marceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Marceneiro" ON public."CabinetMaker" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: CabinetMaker authenticated_select_Marceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Marceneiro" ON public."CabinetMaker" FOR SELECT TO authenticated USING (true);

-- Name: CabinetMaker authenticated_update_Marceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Marceneiro" ON public."CabinetMaker" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
