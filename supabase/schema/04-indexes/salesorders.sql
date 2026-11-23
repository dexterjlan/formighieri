-- Name: salesOrders_addrId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "salesOrders_addrId_idx" ON public."salesOrders" USING btree ("addrId");

-- Name: salesOrders_architectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "salesOrders_architectId_idx" ON public."salesOrders" USING btree ("architectId");

-- Name: salesOrders_clientId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "salesOrders_clientId_idx" ON public."salesOrders" USING btree ("clientId");

-- Name: salesOrders_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "salesOrders_consultantUserId_idx" ON public."salesOrders" USING btree ("consultantUserId");
