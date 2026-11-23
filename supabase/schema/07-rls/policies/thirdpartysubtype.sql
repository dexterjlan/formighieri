-- Name: ThirdPartySubtype authenticated_delete_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ThirdPartySubtype authenticated_insert_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ThirdPartySubtype authenticated_select_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR SELECT TO authenticated USING (true);

-- Name: ThirdPartySubtype authenticated_update_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
