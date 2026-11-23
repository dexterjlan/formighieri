-- Name: WoodworkQualityChecklistItem_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WoodworkQualityChecklistItem_sortOrder_idx" ON public."WoodworkQualityChecklistItem" USING btree ("sortOrder", id);
