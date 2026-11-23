-- Name: SalesCommissionConsultantAdjustment_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionConsultantAdjustment_consultantUserId_idx" ON public."SalesCommissionConsultantAdjustment" USING btree ("consultantUserId");

-- Name: SalesCommissionConsultantAdjustment_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "SalesCommissionConsultantAdjustment_saleYearMonth_idx" ON public."SalesCommissionConsultantAdjustment" USING btree ("saleYearMonth");
