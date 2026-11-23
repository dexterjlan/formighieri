-- Name: ThirdPartyProject_designerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProject_designerId_idx" ON public."ThirdPartyProject" USING btree ("designerId");

-- Name: ThirdPartyProject_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProject_orderId_idx" ON public."ThirdPartyProject" USING btree ("orderId");

-- Name: ThirdPartyProject_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProject_orderProjectId_idx" ON public."ThirdPartyProject" USING btree ("orderProjectId");

-- Name: ThirdPartyProject_orderProject_subtype_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ThirdPartyProject_orderProject_subtype_uidx" ON public."ThirdPartyProject" USING btree ("orderProjectId", "thirdPartySubtypeId");

-- Name: ThirdPartyProject_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartyProject_status_idx" ON public."ThirdPartyProject" USING btree (status);
