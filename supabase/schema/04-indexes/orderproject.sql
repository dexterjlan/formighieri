-- Name: OrderProject_aggregatorOrderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_aggregatorOrderProjectId_idx" ON public."OrderProject" USING btree ("aggregatorOrderProjectId") WHERE ("aggregatorOrderProjectId" IS NOT NULL);

-- Name: OrderProject_conclusaoProjetoTecnico_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_conclusaoProjetoTecnico_idx" ON public."OrderProject" USING btree ("technicalProjectCompletedDate");

-- Name: OrderProject_deliveryPhaseId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_deliveryPhaseId_idx" ON public."OrderProject" USING btree ("deliveryPhaseId");

-- Name: OrderProject_designerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_designerId_idx" ON public."OrderProject" USING btree ("designerId");

-- Name: OrderProject_isAggregator_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_isAggregator_idx" ON public."OrderProject" USING btree ("isAggregator") WHERE ("isAggregator" = true);

-- Name: OrderProject_marceneiroId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_marceneiroId_idx" ON public."OrderProject" USING btree ("cabinetMakerId");

-- Name: OrderProject_parentProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_parentProjectId_idx" ON public."OrderProject" USING btree ("parentProjectId") WHERE ("parentProjectId" IS NOT NULL);

-- Name: OrderProject_previsaoConclusaoProjetoTecnico_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_previsaoConclusaoProjetoTecnico_idx" ON public."OrderProject" USING btree ("technicalProjectForecastEndDate");

-- Name: OrderProject_productionMonth_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_productionMonth_idx" ON public."OrderProject" USING btree ("productionMonth");

-- Name: OrderProject_reviewerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_reviewerId_idx" ON public."OrderProject" USING btree ("reviewerId");

-- Name: OrderProject_statusId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_statusId_idx" ON public."OrderProject" USING btree ("statusId");

-- Name: OrderProject_substituiProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_substituiProjectId_idx" ON public."OrderProject" USING btree ("replacesProjectId") WHERE ("replacesProjectId" IS NOT NULL);

-- Name: OrderProject_substituidoPorProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProject_substituidoPorProjectId_idx" ON public."OrderProject" USING btree ("replacedByProjectId") WHERE ("replacedByProjectId" IS NOT NULL);
