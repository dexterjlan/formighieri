-- Name: appUsers appUsers_authId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_authId_key" UNIQUE ("authId");

-- Name: appUsers appUsers_email_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_email_key" UNIQUE (email);

-- Name: appUsers appUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_pkey" PRIMARY KEY (id);
