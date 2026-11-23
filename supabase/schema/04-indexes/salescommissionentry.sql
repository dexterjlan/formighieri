-- Name: SalesCommissionEntry_close_order_installment_type_key; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "SalesCommissionEntry_close_order_installment_type_key" ON public."SalesCommissionEntry" USING btree ("monthCloseId", "orderCode", "installmentNumber", "entryType") WHERE ("monthCloseId" IS NOT NULL);

-- Name: SalesCommissionEntry_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionEntry_consultantUserId_idx" ON public."SalesCommissionEntry" USING btree ("consultantUserId");

-- Name: SalesCommissionEntry_delivery_bonus_order_key; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "SalesCommissionEntry_delivery_bonus_order_key" ON public."SalesCommissionEntry" USING btree ("salesOrderId", "entryType") WHERE (("entryType" = 'manager_delivery_bonus'::text) AND ("salesOrderId" IS NOT NULL));

-- Name: SalesCommissionEntry_entryType_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionEntry_entryType_idx" ON public."SalesCommissionEntry" USING btree ("entryType");

-- Name: SalesCommissionEntry_monthCloseId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionEntry_monthCloseId_idx" ON public."SalesCommissionEntry" USING btree ("monthCloseId");

-- Name: SalesCommissionEntry_referenceYearMonth_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionEntry_referenceYearMonth_idx" ON public."SalesCommissionEntry" USING btree ("referenceYearMonth");

-- Name: SalesCommissionEntry_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionEntry_saleYearMonth_idx" ON public."SalesCommissionEntry" USING btree ("saleYearMonth");
