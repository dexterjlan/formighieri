-- Name: OrderDeliveryPhase_orderCode_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderDeliveryPhase_orderCode_idx" ON public."OrderDeliveryPhase" USING btree ("orderCode");

-- Name: OrderDeliveryPhase_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderDeliveryPhase_orderId_idx" ON public."OrderDeliveryPhase" USING btree ("orderId");
