-- Name: PreliminaryDesignModuleObservation authenticated_delete_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignModuleObservation authenticated_insert_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignModuleObservation authenticated_select_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR SELECT TO authenticated USING (true);

-- Name: PreliminaryDesignModuleObservation authenticated_update_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
