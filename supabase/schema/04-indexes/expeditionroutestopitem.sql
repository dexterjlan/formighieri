-- Name: ExpeditionRouteStopItem_pickup_pending_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRouteStopItem_pickup_pending_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId", "entityType", "pickupUnloadedAt") WHERE ("entityType" = 'Pickup'::text);

-- Name: ExpeditionRouteStopItem_routeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRouteStopItem_routeId_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId");

-- Name: ExpeditionRouteStopItem_route_entity_unique_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ExpeditionRouteStopItem_route_entity_unique_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId", "entityType", "entityId");

-- Name: ExpeditionRouteStopItem_stopId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ExpeditionRouteStopItem_stopId_idx" ON public."ExpeditionRouteStopItem" USING btree ("stopId", id);
