-- Name: ThirdPartyProjectStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProjectStatusHistory_changedAt_idx" ON public."ThirdPartyProjectStatusHistory" USING btree ("changedAt" DESC);

-- Name: ThirdPartyProjectStatusHistory_projectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProjectStatusHistory_projectId_idx" ON public."ThirdPartyProjectStatusHistory" USING btree ("thirdPartyProjectId");
