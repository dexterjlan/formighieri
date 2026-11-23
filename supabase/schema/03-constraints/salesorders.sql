-- Name: salesOrders salesOrders_orderCode_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_orderCode_key" UNIQUE ("orderCode");

-- Name: salesOrders salesOrders_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_pkey" PRIMARY KEY (id);
