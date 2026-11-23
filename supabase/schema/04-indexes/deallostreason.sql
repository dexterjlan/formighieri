-- Name: DealLostReason_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DealLostReason_isActive_sortOrder_idx" ON public."DealLostReason" USING btree ("isActive", "sortOrder", id);

-- Name: DealLostReason_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DealLostReason_name_unique_ci_idx" ON public."DealLostReason" USING btree (lower(TRIM(BOTH FROM name)));
