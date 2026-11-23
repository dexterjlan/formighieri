-- Name: ExpeditionVolume ExpeditionVolume_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_pkey" PRIMARY KEY (id);

-- Name: ExpeditionVolume ExpeditionVolume_stop_item_index_unique; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_stop_item_index_unique" UNIQUE ("stopItemId", "volumeIndex");

-- Name: ExpeditionVolume ExpeditionVolume_volumeCode_unique; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_volumeCode_unique" UNIQUE ("volumeCode");
