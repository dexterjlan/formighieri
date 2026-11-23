-- Name: MeasurementProject MeasurementProject_measurementId_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MeasurementProject_measurementId_orderProjectId_key" UNIQUE ("measurementId", "orderProjectId");

-- Name: MeasurementProject MeasurementProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MeasurementProject_pkey" PRIMARY KEY (id);
