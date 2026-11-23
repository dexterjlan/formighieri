-- Name: ActivityLog_action_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ActivityLog_action_idx" ON public."ActivityLog" USING btree (action);

-- Name: ActivityLog_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ActivityLog_changedAt_idx" ON public."ActivityLog" USING btree ("changedAt" DESC);

-- Name: ActivityLog_changedById_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ActivityLog_changedById_changedAt_idx" ON public."ActivityLog" USING btree ("changedById", "changedAt" DESC);

-- Name: ActivityLog_orderId_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ActivityLog_orderId_changedAt_idx" ON public."ActivityLog" USING btree ("orderId", "changedAt" DESC);

-- Name: ActivityLog_orderProjectId_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ActivityLog_orderProjectId_changedAt_idx" ON public."ActivityLog" USING btree ("orderProjectId", "changedAt" DESC);
