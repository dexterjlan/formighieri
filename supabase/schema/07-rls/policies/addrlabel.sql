-- Name: addrlabel authenticated_delete_addrlabel; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_addrlabel ON public.addrlabel FOR DELETE TO authenticated USING (true);

-- Name: addrlabel authenticated_insert_addrlabel; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_addrlabel ON public.addrlabel FOR INSERT TO authenticated WITH CHECK (true);

-- Name: addrlabel authenticated_select_addrlabel; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_addrlabel ON public.addrlabel FOR SELECT TO authenticated USING (true);

-- Name: addrlabel authenticated_update_addrlabel; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_addrlabel ON public.addrlabel FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
