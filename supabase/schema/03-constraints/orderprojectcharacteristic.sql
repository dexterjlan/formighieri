-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_orderProjectId_characteristicId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_orderProjectId_characteristicId_key" UNIQUE ("orderProjectId", "characteristicId");

-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_pkey" PRIMARY KEY (id);
