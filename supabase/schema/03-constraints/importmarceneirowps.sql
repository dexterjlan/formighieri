-- Name: importMarceneiroWPS importMarceneiroWPS_MarceneiroWPS_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importMarceneiroWPS"
    ADD CONSTRAINT "importMarceneiroWPS_MarceneiroWPS_key" UNIQUE ("cabinetMakerWps");

-- Name: importMarceneiroWPS importMarceneiroWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importMarceneiroWPS"
    ADD CONSTRAINT "importMarceneiroWPS_pkey" PRIMARY KEY (id);
