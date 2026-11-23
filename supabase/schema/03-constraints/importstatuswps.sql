-- Name: importStatusWPS importStatusWPS_StatusWPS_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importStatusWPS"
    ADD CONSTRAINT "importStatusWPS_StatusWPS_key" UNIQUE ("statusWps");

-- Name: importStatusWPS importStatusWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importStatusWPS"
    ADD CONSTRAINT "importStatusWPS_pkey" PRIMARY KEY (id);
