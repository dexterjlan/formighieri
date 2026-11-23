-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_order_installment_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_order_installment_key" UNIQUE ("salesOrderId", "installmentNumber");

-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_pkey" PRIMARY KEY (id);
