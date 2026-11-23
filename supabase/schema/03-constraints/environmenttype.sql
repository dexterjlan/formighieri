-- Name: EnvironmentType EnvironmentType_name_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."EnvironmentType"
    ADD CONSTRAINT "EnvironmentType_name_key" UNIQUE (name);

-- Name: EnvironmentType EnvironmentType_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."EnvironmentType"
    ADD CONSTRAINT "EnvironmentType_pkey" PRIMARY KEY (id);
