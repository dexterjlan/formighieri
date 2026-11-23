-- Name: ExpeditionRoute_responsibleUserId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRoute_responsibleUserId_idx" ON public."ExpeditionRoute" USING btree ("responsibleUserId");

-- Name: ExpeditionRoute_routeDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRoute_routeDate_idx" ON public."ExpeditionRoute" USING btree ("routeDate" DESC, id DESC);
