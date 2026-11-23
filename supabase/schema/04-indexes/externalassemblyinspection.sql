-- Name: ExternalAssemblyInspection_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExternalAssemblyInspection_orderId_idx" ON public."ExternalAssemblyInspection" USING btree ("orderId");

-- Name: ExternalAssemblyInspection_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExternalAssemblyInspection_status_idx" ON public."ExternalAssemblyInspection" USING btree (status);
