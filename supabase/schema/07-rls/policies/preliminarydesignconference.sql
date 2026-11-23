-- Name: PreliminaryDesignConference authenticated_delete_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignConference authenticated_insert_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignConference authenticated_select_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR SELECT TO authenticated USING (true);

-- Name: PreliminaryDesignConference authenticated_update_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
