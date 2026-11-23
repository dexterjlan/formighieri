-- Name: DealNote authenticated_delete_dealnote; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_dealnote ON public."DealNote" FOR DELETE TO authenticated USING (true);

-- Name: DealNote authenticated_insert_dealnote; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_dealnote ON public."DealNote" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: DealNote authenticated_select_dealnote; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_dealnote ON public."DealNote" FOR SELECT TO authenticated USING (true);

-- Name: DealNote authenticated_update_dealnote; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_dealnote ON public."DealNote" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
