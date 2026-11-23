-- Name: Client authenticated_delete_Cliente; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Cliente" ON public."Client" FOR DELETE TO authenticated USING (true);

-- Name: Client authenticated_insert_Cliente; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Cliente" ON public."Client" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: Client authenticated_select_Cliente; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Cliente" ON public."Client" FOR SELECT TO authenticated USING (true);

-- Name: Client authenticated_update_Cliente; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Cliente" ON public."Client" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
