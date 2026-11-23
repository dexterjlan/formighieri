-- Name: OrderRequestAttachment_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderRequestAttachment_createdAt_idx" ON public."OrderRequestAttachment" USING btree ("createdAt");

-- Name: OrderRequestAttachment_orderRequestActivityId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "OrderRequestAttachment_orderRequestActivityId_uidx" ON public."OrderRequestAttachment" USING btree ("orderRequestActivityId") WHERE ("orderRequestActivityId" IS NOT NULL);

-- Name: OrderRequestAttachment_orderRequestId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderRequestAttachment_orderRequestId_idx" ON public."OrderRequestAttachment" USING btree ("orderRequestId");
