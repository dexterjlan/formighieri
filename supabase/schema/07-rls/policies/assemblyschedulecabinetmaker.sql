-- Name: AssemblyScheduleCabinetMaker authenticated_delete_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: AssemblyScheduleCabinetMaker authenticated_insert_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: AssemblyScheduleCabinetMaker authenticated_select_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR SELECT TO authenticated USING (true);

-- Name: AssemblyScheduleCabinetMaker authenticated_update_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
