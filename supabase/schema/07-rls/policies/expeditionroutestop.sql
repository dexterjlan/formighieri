-- Name: ExpeditionRouteStop authenticated_delete_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExpeditionRouteStop authenticated_insert_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExpeditionRouteStop authenticated_select_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR SELECT TO authenticated USING (true);

-- Name: ExpeditionRouteStop authenticated_update_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
