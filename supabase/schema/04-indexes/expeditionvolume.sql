-- Name: ExpeditionVolume_routeId_boardedAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionVolume_routeId_boardedAt_idx" ON public."ExpeditionVolume" USING btree ("routeId", "boardedAt");

-- Name: ExpeditionVolume_routeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionVolume_routeId_idx" ON public."ExpeditionVolume" USING btree ("routeId", "volumeIndex");
