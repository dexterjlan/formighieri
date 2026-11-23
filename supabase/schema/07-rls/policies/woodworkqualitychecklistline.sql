-- Name: WoodworkQualityChecklistLine authenticated_delete_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR DELETE TO authenticated USING (true);

-- Name: WoodworkQualityChecklistLine authenticated_insert_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: WoodworkQualityChecklistLine authenticated_select_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR SELECT TO authenticated USING (true);

-- Name: WoodworkQualityChecklistLine authenticated_update_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
