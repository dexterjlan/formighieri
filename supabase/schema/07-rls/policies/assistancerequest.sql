-- Name: AssistanceRequest authenticated_delete_AssistanceRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_AssistanceRequest" ON public."AssistanceRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: AssistanceRequest authenticated_insert_AssistanceRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AssistanceRequest" ON public."AssistanceRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: AssistanceRequest authenticated_select_AssistanceRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AssistanceRequest" ON public."AssistanceRequest" FOR SELECT TO authenticated USING (true);

-- Name: AssistanceRequest authenticated_update_AssistanceRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AssistanceRequest" ON public."AssistanceRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
