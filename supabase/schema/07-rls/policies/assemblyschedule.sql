-- Name: AssemblySchedule authenticated_delete_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_MontagemProgramacao" ON public."AssemblySchedule" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: AssemblySchedule authenticated_insert_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_MontagemProgramacao" ON public."AssemblySchedule" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: AssemblySchedule authenticated_select_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_MontagemProgramacao" ON public."AssemblySchedule" FOR SELECT TO authenticated USING (true);

-- Name: AssemblySchedule authenticated_update_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_MontagemProgramacao" ON public."AssemblySchedule" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
