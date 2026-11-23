-- Name: OrderRequest authenticated_insert_orderConversations; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_orderConversations" ON public."OrderRequest" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: OrderRequest authenticated_select_orderConversations; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_orderConversations" ON public."OrderRequest" FOR SELECT TO authenticated USING (true);

-- Name: OrderRequest authenticated_update_orderConversations; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_orderConversations" ON public."OrderRequest" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
