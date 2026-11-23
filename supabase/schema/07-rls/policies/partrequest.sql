-- Name: PartRequest authenticated_delete_PartRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_PartRequest" ON public."PartRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PartRequest authenticated_insert_PartRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_PartRequest" ON public."PartRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PartRequest authenticated_select_PartRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_PartRequest" ON public."PartRequest" FOR SELECT TO authenticated USING (true);

-- Name: PartRequest authenticated_update_PartRequest; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_PartRequest" ON public."PartRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
