-- Name: DealActivity authenticated_delete_dealactivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_dealactivity ON public."DealActivity" FOR DELETE TO authenticated USING (true);

-- Name: DealActivity authenticated_insert_dealactivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_dealactivity ON public."DealActivity" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: DealActivity authenticated_select_dealactivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_dealactivity ON public."DealActivity" FOR SELECT TO authenticated USING (true);

-- Name: DealActivity authenticated_update_dealactivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_dealactivity ON public."DealActivity" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
