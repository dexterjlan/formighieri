-- Name: DealStage_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DealStage_isActive_sortOrder_idx" ON public."DealStage" USING btree ("isActive", "sortOrder", id);

-- Name: DealStage_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DealStage_name_unique_ci_idx" ON public."DealStage" USING btree (lower(TRIM(BOTH FROM name)));

-- Name: DealStage_pipedriveStageId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DealStage_pipedriveStageId_uidx" ON public."DealStage" USING btree ("pipedriveStageId") WHERE ("pipedriveStageId" IS NOT NULL);
