-- Name: ThirdPartySubtype_name_unique_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ThirdPartySubtype_name_unique_idx" ON public."ThirdPartySubtype" USING btree (lower(TRIM(BOTH FROM name)));

-- Name: ThirdPartySubtype_projectCharacteristicId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartySubtype_projectCharacteristicId_idx" ON public."ThirdPartySubtype" USING btree ("projectCharacteristicId");

-- Name: ThirdPartySubtype_projectCharacteristicId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ThirdPartySubtype_projectCharacteristicId_uidx" ON public."ThirdPartySubtype" USING btree ("projectCharacteristicId") WHERE ("projectCharacteristicId" IS NOT NULL);

-- Name: ThirdPartySubtype_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ThirdPartySubtype_sortOrder_idx" ON public."ThirdPartySubtype" USING btree ("sortOrder");
