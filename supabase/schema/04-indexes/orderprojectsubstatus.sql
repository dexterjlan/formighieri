-- Name: OrderProjectSubstatus_kind_open_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectSubstatus_kind_open_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId", kind) WHERE ("endedAt" IS NULL);

-- Name: OrderProjectSubstatus_one_open_awaiting_request_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "OrderProjectSubstatus_one_open_awaiting_request_uidx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId") WHERE ((kind = 'AwaitingRequest'::text) AND ("endedAt" IS NULL));

-- Name: OrderProjectSubstatus_one_open_per_kind_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "OrderProjectSubstatus_one_open_per_kind_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId", kind) WHERE ("endedAt" IS NULL);

-- Name: OrderProjectSubstatus_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectSubstatus_orderProjectId_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId");
