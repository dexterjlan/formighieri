-- Name: WpsItemRegistrationRequest authenticated_delete_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: WpsItemRegistrationRequest authenticated_insert_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: WpsItemRegistrationRequest authenticated_select_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR SELECT TO authenticated USING (true);

-- Name: WpsItemRegistrationRequest authenticated_update_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
