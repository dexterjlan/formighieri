-- Name: AssistanceRequestStatusHistory_assistanceRequestId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssistanceRequestStatusHistory_assistanceRequestId_idx" ON public."AssistanceRequestStatusHistory" USING btree ("assistanceRequestId");

-- Name: AssistanceRequestStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssistanceRequestStatusHistory_changedAt_idx" ON public."AssistanceRequestStatusHistory" USING btree ("changedAt");
