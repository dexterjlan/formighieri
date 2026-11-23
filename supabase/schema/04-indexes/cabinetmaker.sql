-- Name: CabinetMaker_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CabinetMaker_sortOrder_idx" ON public."CabinetMaker" USING btree ("sortOrder", id);

-- Name: Marceneiro_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Marceneiro_name_unique_ci_idx" ON public."CabinetMaker" USING btree (lower(TRIM(BOTH FROM name)));
