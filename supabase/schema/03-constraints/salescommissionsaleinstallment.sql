-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_pkey" PRIMARY KEY (id);

-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_sale_installment_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_sale_installment_key" UNIQUE ("salesCommissionSaleId", "installmentNumber");
