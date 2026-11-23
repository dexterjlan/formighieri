-- Name: CalendarEvent authenticated_delete_CalendarEvent; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_CalendarEvent" ON public."CalendarEvent" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: CalendarEvent authenticated_insert_CalendarEvent; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_CalendarEvent" ON public."CalendarEvent" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: CalendarEvent authenticated_select_CalendarEvent; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_CalendarEvent" ON public."CalendarEvent" FOR SELECT TO authenticated USING (true);

-- Name: CalendarEvent authenticated_update_CalendarEvent; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_CalendarEvent" ON public."CalendarEvent" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
