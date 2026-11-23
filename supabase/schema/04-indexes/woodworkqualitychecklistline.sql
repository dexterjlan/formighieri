-- Name: WoodworkQualityChecklistLine_checklistId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WoodworkQualityChecklistLine_checklistId_idx" ON public."WoodworkQualityChecklistLine" USING btree ("checklistId", "sortOrder");
