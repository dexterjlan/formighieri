-- Name: Architect_isActive_name_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Architect_isActive_name_idx" ON public."Architect" USING btree ("isActive", name);

-- Name: Architect_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Architect_name_unique_ci_idx" ON public."Architect" USING btree (lower(TRIM(BOTH FROM name)));
