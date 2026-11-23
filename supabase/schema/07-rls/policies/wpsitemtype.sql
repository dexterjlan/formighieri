-- Name: WpsItemType authenticated_delete_WpsItemType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_WpsItemType" ON public."WpsItemType" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: WpsItemType authenticated_insert_WpsItemType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_WpsItemType" ON public."WpsItemType" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: WpsItemType authenticated_select_WpsItemType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_WpsItemType" ON public."WpsItemType" FOR SELECT TO authenticated USING (true);

-- Name: WpsItemType authenticated_update_WpsItemType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_WpsItemType" ON public."WpsItemType" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
