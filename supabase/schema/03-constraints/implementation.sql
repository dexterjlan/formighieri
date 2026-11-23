-- Name: Implementation Implementation_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_orderProjectId_key" UNIQUE ("orderProjectId");

-- Name: Implementation Implementation_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_pkey" PRIMARY KEY (id);
