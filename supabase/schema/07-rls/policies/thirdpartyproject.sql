-- Name: ThirdPartyProject authenticated_delete_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ThirdPartyProject" ON public."ThirdPartyProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ThirdPartyProject authenticated_insert_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ThirdPartyProject" ON public."ThirdPartyProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ThirdPartyProject authenticated_select_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ThirdPartyProject" ON public."ThirdPartyProject" FOR SELECT TO authenticated USING (true);

-- Name: ThirdPartyProject authenticated_update_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ThirdPartyProject" ON public."ThirdPartyProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
