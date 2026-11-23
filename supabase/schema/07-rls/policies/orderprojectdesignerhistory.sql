-- Name: OrderProjectDesignerHistory authenticated_delete_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR DELETE TO authenticated USING (true);

-- Name: OrderProjectDesignerHistory authenticated_insert_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: OrderProjectDesignerHistory authenticated_select_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR SELECT TO authenticated USING (true);
