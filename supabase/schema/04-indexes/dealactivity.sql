-- Name: DealActivity_dealId_dueDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DealActivity_dealId_dueDate_idx" ON public."DealActivity" USING btree ("dealId", "isDone", "dueDate");

-- Name: DealActivity_owner_dueDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DealActivity_owner_dueDate_idx" ON public."DealActivity" USING btree ("ownerUserId", "isDone", "dueDate");

-- Name: DealActivity_pipedriveActivityId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DealActivity_pipedriveActivityId_uidx" ON public."DealActivity" USING btree ("pipedriveActivityId") WHERE ("pipedriveActivityId" IS NOT NULL);
