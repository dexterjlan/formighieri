-- Name: AssemblyScheduleInstaller authenticated_delete_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: AssemblyScheduleInstaller authenticated_insert_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: AssemblyScheduleInstaller authenticated_select_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR SELECT TO authenticated USING (true);

-- Name: AssemblyScheduleInstaller authenticated_update_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
