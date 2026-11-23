-- Name: PartRequest_cabinetMakerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_cabinetMakerId_idx" ON public."PartRequest" USING btree ("cabinetMakerId");

-- Name: PartRequest_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_createdAt_idx" ON public."PartRequest" USING btree ("createdAt" DESC);

-- Name: PartRequest_deliveryDueDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_deliveryDueDate_idx" ON public."PartRequest" USING btree ("deliveryDueDate");

-- Name: PartRequest_factoryEmployeeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_factoryEmployeeId_idx" ON public."PartRequest" USING btree ("factoryEmployeeId");

-- Name: PartRequest_montadorId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_montadorId_idx" ON public."PartRequest" USING btree ("montadorId");

-- Name: PartRequest_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_orderId_idx" ON public."PartRequest" USING btree ("orderId");

-- Name: PartRequest_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_orderProjectId_idx" ON public."PartRequest" USING btree ("orderProjectId");

-- Name: PartRequest_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequest_status_idx" ON public."PartRequest" USING btree (status);
