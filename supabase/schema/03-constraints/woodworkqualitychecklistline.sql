-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_checklistId_sortOrder_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_checklistId_sortOrder_key" UNIQUE ("checklistId", "sortOrder");

-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_pkey" PRIMARY KEY (id);
