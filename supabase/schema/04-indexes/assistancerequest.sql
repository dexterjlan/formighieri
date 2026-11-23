-- Name: AssistanceRequest_clientId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssistanceRequest_clientId_idx" ON public."AssistanceRequest" USING btree ("clientId");

-- Name: AssistanceRequest_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssistanceRequest_orderId_idx" ON public."AssistanceRequest" USING btree ("orderId");

-- Name: AssistanceRequest_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssistanceRequest_status_idx" ON public."AssistanceRequest" USING btree (status);
