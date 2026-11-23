-- Name: Client_isActive_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Client_isActive_idx" ON public."Client" USING btree ("isActive");

-- Name: Client_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Client_name_unique_ci_idx" ON public."Client" USING btree (lower(TRIM(BOTH FROM name)));

-- Name: Client_pipedriveOrgId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Client_pipedriveOrgId_uidx" ON public."Client" USING btree ("pipedriveOrgId") WHERE ("pipedriveOrgId" IS NOT NULL);
