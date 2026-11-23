-- Name: Implementation authenticated_delete_Implantacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Implantacao" ON public."Implementation" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: Implementation authenticated_insert_Implantacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Implantacao" ON public."Implementation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: Implementation authenticated_select_Implantacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Implantacao" ON public."Implementation" FOR SELECT TO authenticated USING (true);

-- Name: Implementation authenticated_update_Implantacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Implantacao" ON public."Implementation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
