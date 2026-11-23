-- Name: SalesMonthlyTarget SalesMonthlyTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesMonthlyTarget"
    ADD CONSTRAINT "SalesMonthlyTarget_pkey" PRIMARY KEY (id);

-- Name: SalesMonthlyTarget SalesMonthlyTarget_yearMonth_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesMonthlyTarget"
    ADD CONSTRAINT "SalesMonthlyTarget_yearMonth_key" UNIQUE ("yearMonth");
