-- Name: OrderProjectDesignerHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectDesignerHistory_changedAt_idx" ON public."OrderProjectDesignerHistory" USING btree ("changedAt" DESC);

-- Name: OrderProjectDesignerHistory_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectDesignerHistory_orderProjectId_idx" ON public."OrderProjectDesignerHistory" USING btree ("orderProjectId");

-- Name: OrderProjectDesignerHistory_source_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectDesignerHistory_source_idx" ON public."OrderProjectDesignerHistory" USING btree ("orderProjectId", "sourceType", "sourceId");
