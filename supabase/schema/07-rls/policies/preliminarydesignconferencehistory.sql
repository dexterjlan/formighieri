-- Name: PreliminaryDesignConferenceHistory authenticated_insert_AnteprojetoConferenceHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoConferenceHistory" ON public."PreliminaryDesignConferenceHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignConferenceHistory authenticated_select_AnteprojetoConferenceHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoConferenceHistory" ON public."PreliminaryDesignConferenceHistory" FOR SELECT TO authenticated USING (true);
