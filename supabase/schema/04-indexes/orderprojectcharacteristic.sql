-- Name: OrderProjectCharacteristic_characteristicId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectCharacteristic_characteristicId_idx" ON public."OrderProjectCharacteristic" USING btree ("characteristicId");

-- Name: OrderProjectCharacteristic_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "OrderProjectCharacteristic_orderProjectId_idx" ON public."OrderProjectCharacteristic" USING btree ("orderProjectId");
