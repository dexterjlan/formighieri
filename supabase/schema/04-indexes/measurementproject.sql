-- Name: MeasurementProject_measurementId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MeasurementProject_measurementId_idx" ON public."MeasurementProject" USING btree ("measurementId");

-- Name: MeasurementProject_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MeasurementProject_orderProjectId_idx" ON public."MeasurementProject" USING btree ("orderProjectId");
