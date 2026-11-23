-- Name: Detailing Detailing_orderProjectId_detailingType_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_orderProjectId_detailingType_key" UNIQUE ("orderProjectId", "detailingType");

-- Name: Detailing Detailing_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_pkey" PRIMARY KEY (id);
