-- Name: ProjectCharacteristic_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ProjectCharacteristic_name_unique_ci_idx" ON public."ProjectCharacteristic" USING btree (lower(TRIM(BOTH FROM name)));

-- Name: ProjectCharacteristic_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ProjectCharacteristic_sortOrder_idx" ON public."ProjectCharacteristic" USING btree ("sortOrder", id);
