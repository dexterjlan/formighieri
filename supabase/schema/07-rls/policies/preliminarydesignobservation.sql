-- Name: PreliminaryDesignObservation authenticated_insert_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignObservation authenticated_select_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR SELECT TO authenticated USING (true);

-- Name: PreliminaryDesignObservation authenticated_update_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
