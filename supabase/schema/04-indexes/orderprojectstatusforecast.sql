-- Name: OrderProjectStatusForecast_cabinetMakerId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusForecast_cabinetMakerId_idx" ON public."OrderProjectStatusForecast" USING btree ("cabinetMakerId");

-- Name: OrderProjectStatusForecast_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusForecast_orderProjectId_idx" ON public."OrderProjectStatusForecast" USING btree ("orderProjectId");

-- Name: OrderProjectStatusForecast_project_status_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "OrderProjectStatusForecast_project_status_uidx" ON public."OrderProjectStatusForecast" USING btree ("orderProjectId", "statusId");

-- Name: OrderProjectStatusForecast_statusId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusForecast_statusId_idx" ON public."OrderProjectStatusForecast" USING btree ("statusId");

-- Name: OrderProjectStatusForecast_userId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectStatusForecast_userId_idx" ON public."OrderProjectStatusForecast" USING btree ("userId");
