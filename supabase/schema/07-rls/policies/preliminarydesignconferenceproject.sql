-- Name: PreliminaryDesignConferenceProject authenticated_delete_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignConferenceProject authenticated_insert_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignConferenceProject authenticated_select_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR SELECT TO authenticated USING (true);

-- Name: PreliminaryDesignConferenceProject authenticated_update_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
