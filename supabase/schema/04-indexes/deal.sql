-- Name: Deal_architectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Deal_architectId_idx" ON public."Deal" USING btree ("architectId");

-- Name: Deal_clientId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Deal_clientId_idx" ON public."Deal" USING btree ("clientId");

-- Name: Deal_orderId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Deal_orderId_uidx" ON public."Deal" USING btree ("orderId") WHERE ("orderId" IS NOT NULL);

-- Name: Deal_owner_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Deal_owner_status_idx" ON public."Deal" USING btree ("ownerUserId", status);

-- Name: Deal_pipedriveDealId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Deal_pipedriveDealId_uidx" ON public."Deal" USING btree ("pipedriveDealId") WHERE ("pipedriveDealId" IS NOT NULL);

-- Name: Deal_stageId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Deal_stageId_idx" ON public."Deal" USING btree ("stageId");

-- Name: Deal_wpsQuoteCode_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Deal_wpsQuoteCode_idx" ON public."Deal" USING btree ("wpsQuoteCode") WHERE ("wpsQuoteCode" IS NOT NULL);
