-- Name: WpsItemType WpsItemType_name_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_name_key" UNIQUE (name);

-- Name: WpsItemType WpsItemType_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_pkey" PRIMARY KEY (id);
