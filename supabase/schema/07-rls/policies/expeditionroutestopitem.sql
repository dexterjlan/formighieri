-- Name: ExpeditionRouteStopItem authenticated_delete_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: ExpeditionRouteStopItem authenticated_insert_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: ExpeditionRouteStopItem authenticated_select_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR SELECT TO authenticated USING (true);

-- Name: ExpeditionRouteStopItem authenticated_update_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
