-- Name: ExternalAssemblyInspectionActivity authenticated_delete_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspectionActivity authenticated_insert_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspectionActivity authenticated_select_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR SELECT TO authenticated USING (true);

-- Name: ExternalAssemblyInspectionActivity authenticated_update_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
