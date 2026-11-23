-- Name: Architect authenticated_delete_architect; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_architect ON public."Architect" FOR DELETE TO authenticated USING (true);

-- Name: Architect authenticated_insert_architect; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_architect ON public."Architect" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: Architect authenticated_select_architect; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_architect ON public."Architect" FOR SELECT TO authenticated USING (true);

-- Name: Architect authenticated_update_architect; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_architect ON public."Architect" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
