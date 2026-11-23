-- Name: ProjectProductionQueue ProjectProductionQueue_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_orderProjectId_key" UNIQUE ("orderProjectId");

-- Name: ProjectProductionQueue ProjectProductionQueue_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_pkey" PRIMARY KEY (id);
