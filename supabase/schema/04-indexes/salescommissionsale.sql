-- Name: SalesCommissionSale_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionSale_consultantUserId_idx" ON public."SalesCommissionSale" USING btree ("consultantUserId");

-- Name: SalesCommissionSale_isImported_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionSale_isImported_idx" ON public."SalesCommissionSale" USING btree ("isImported");

-- Name: SalesCommissionSale_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionSale_saleYearMonth_idx" ON public."SalesCommissionSale" USING btree ("saleYearMonth");

-- Name: SalesCommissionSale_salesOrderId_key; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "SalesCommissionSale_salesOrderId_key" ON public."SalesCommissionSale" USING btree ("salesOrderId") WHERE ("salesOrderId" IS NOT NULL);
