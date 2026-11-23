-- Name: Implantacao_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Implantacao_orderProjectId_idx" ON public."Implementation" USING btree ("orderProjectId");

-- Name: Implementation_designerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Implementation_designerId_idx" ON public."Implementation" USING btree ("designerId");

-- Name: Implementation_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Implementation_status_idx" ON public."Implementation" USING btree (status);
