-- Name: WoodworkQualityChecklist authenticated_delete_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR DELETE TO authenticated USING (true);

-- Name: WoodworkQualityChecklist authenticated_insert_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: WoodworkQualityChecklist authenticated_select_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR SELECT TO authenticated USING (true);

-- Name: WoodworkQualityChecklist authenticated_update_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
