-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_orderProjectId_versionNumber_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_orderProjectId_versionNumber_key" UNIQUE ("orderProjectId", "versionNumber");

-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_pkey" PRIMARY KEY (id);
