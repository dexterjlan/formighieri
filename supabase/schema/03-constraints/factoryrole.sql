-- Name: FactoryRole FactoryRole_name_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryRole"
    ADD CONSTRAINT "FactoryRole_name_key" UNIQUE (name);

-- Name: FactoryRole FactoryRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryRole"
    ADD CONSTRAINT "FactoryRole_pkey" PRIMARY KEY (id);
