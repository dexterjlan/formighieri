-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_pkey" PRIMARY KEY (id);

-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_saleYearMonth_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_saleYearMonth_key" UNIQUE ("saleYearMonth");
