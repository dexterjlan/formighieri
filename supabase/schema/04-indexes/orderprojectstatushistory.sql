-- Name: OrderProjectStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusHistory_changedAt_idx" ON public."OrderProjectStatusHistory" USING btree ("changedAt" DESC);

-- Name: OrderProjectStatusHistory_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusHistory_orderProjectId_idx" ON public."OrderProjectStatusHistory" USING btree ("orderProjectId");
