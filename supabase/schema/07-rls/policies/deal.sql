-- Name: Deal authenticated_delete_deal; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_deal ON public."Deal" FOR DELETE TO authenticated USING (true);

-- Name: Deal authenticated_insert_deal; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_deal ON public."Deal" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: Deal authenticated_select_deal; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_deal ON public."Deal" FOR SELECT TO authenticated USING (true);

-- Name: Deal authenticated_update_deal; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_deal ON public."Deal" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
