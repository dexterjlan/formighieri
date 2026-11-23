-- Name: CalendarEventType authenticated_delete_CalendarEventType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_CalendarEventType" ON public."CalendarEventType" FOR DELETE TO authenticated USING (true);

-- Name: CalendarEventType authenticated_insert_CalendarEventType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_CalendarEventType" ON public."CalendarEventType" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: CalendarEventType authenticated_select_CalendarEventType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_CalendarEventType" ON public."CalendarEventType" FOR SELECT TO authenticated USING (true);

-- Name: CalendarEventType authenticated_update_CalendarEventType; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_CalendarEventType" ON public."CalendarEventType" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
