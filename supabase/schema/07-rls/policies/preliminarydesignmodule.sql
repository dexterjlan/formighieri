-- Name: PreliminaryDesignModule authenticated_delete_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignModule authenticated_insert_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PreliminaryDesignModule authenticated_select_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR SELECT TO authenticated USING (true);

-- Name: PreliminaryDesignModule authenticated_update_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
