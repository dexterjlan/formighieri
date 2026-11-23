-- Name: WoodworkQualityChecklistItem authenticated_delete_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR DELETE TO authenticated USING (true);

-- Name: WoodworkQualityChecklistItem authenticated_insert_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: WoodworkQualityChecklistItem authenticated_select_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR SELECT TO authenticated USING (true);

-- Name: WoodworkQualityChecklistItem authenticated_update_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
