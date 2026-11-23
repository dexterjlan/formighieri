-- Name: ExternalAssemblyInspection authenticated_delete_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspection authenticated_insert_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspection authenticated_select_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR SELECT TO authenticated USING (true);

-- Name: ExternalAssemblyInspection authenticated_update_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
