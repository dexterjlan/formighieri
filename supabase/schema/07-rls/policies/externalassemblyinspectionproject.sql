-- Name: ExternalAssemblyInspectionProject authenticated_delete_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspectionProject authenticated_insert_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExternalAssemblyInspectionProject authenticated_select_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR SELECT TO authenticated USING (true);

-- Name: ExternalAssemblyInspectionProject authenticated_update_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
