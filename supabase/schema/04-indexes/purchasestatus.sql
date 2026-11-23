-- Name: PurchaseStatus_name_unique_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "PurchaseStatus_name_unique_idx" ON public."PurchaseStatus" USING btree (lower(TRIM(BOTH FROM name)));

-- Name: PurchaseStatus_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PurchaseStatus_sortOrder_idx" ON public."PurchaseStatus" USING btree ("sortOrder");
