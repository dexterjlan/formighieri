-- Name: Detailing_designerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Detailing_designerId_idx" ON public."Detailing" USING btree ("designerId");

-- Name: Detailing_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Detailing_orderProjectId_idx" ON public."Detailing" USING btree ("orderProjectId");

-- Name: Detailing_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Detailing_status_idx" ON public."Detailing" USING btree (status);
