-- Name: ExpeditionRouteStop_routeId_sort_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRouteStop_routeId_sort_idx" ON public."ExpeditionRouteStop" USING btree ("routeId", "sortOrder", id);
