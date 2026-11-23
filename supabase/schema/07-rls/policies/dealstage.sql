-- Name: DealStage authenticated_delete_dealstage; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_dealstage ON public."DealStage" FOR DELETE TO authenticated USING (true);

-- Name: DealStage authenticated_insert_dealstage; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_dealstage ON public."DealStage" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: DealStage authenticated_select_dealstage; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_dealstage ON public."DealStage" FOR SELECT TO authenticated USING (true);

-- Name: DealStage authenticated_update_dealstage; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_dealstage ON public."DealStage" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
