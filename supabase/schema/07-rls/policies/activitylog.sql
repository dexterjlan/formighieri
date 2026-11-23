-- Name: ActivityLog ActivityLog_insert_definer; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "ActivityLog_insert_definer" ON public."ActivityLog" FOR INSERT TO authenticated WITH CHECK (false);

-- Name: ActivityLog ActivityLog_select_admin; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "ActivityLog_select_admin" ON public."ActivityLog" FOR SELECT TO authenticated USING (public.is_app_admin());
