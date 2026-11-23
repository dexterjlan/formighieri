-- Name: WoodworkQualityChecklist_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WoodworkQualityChecklist_orderProjectId_idx" ON public."WoodworkQualityChecklist" USING btree ("orderProjectId", "versionNumber" DESC);
