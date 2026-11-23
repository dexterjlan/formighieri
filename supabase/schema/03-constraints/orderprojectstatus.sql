-- Name: OrderProjectStatus OrderProjectStatus_name_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatus"
    ADD CONSTRAINT "OrderProjectStatus_name_key" UNIQUE (name);

-- Name: OrderProjectStatus OrderProjectStatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatus"
    ADD CONSTRAINT "OrderProjectStatus_pkey" PRIMARY KEY (id);
