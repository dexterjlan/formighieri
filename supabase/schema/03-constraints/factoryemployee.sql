-- Name: FactoryEmployee FactoryEmployee_legacyCabinetMakerId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_legacyCabinetMakerId_key" UNIQUE ("legacyCabinetMakerId");

-- Name: FactoryEmployee FactoryEmployee_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_pkey" PRIMARY KEY (id);
