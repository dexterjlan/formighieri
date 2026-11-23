-- Name: importConsultorWPS importConsultorWPS_ConsultorWPS_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importConsultorWPS"
    ADD CONSTRAINT "importConsultorWPS_ConsultorWPS_key" UNIQUE ("consultantWps");

-- Name: importConsultorWPS importConsultorWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."importConsultorWPS"
    ADD CONSTRAINT "importConsultorWPS_pkey" PRIMARY KEY (id);
