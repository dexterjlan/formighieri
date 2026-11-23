-- Name: Purchase_assistanceRequestId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Purchase_assistanceRequestId_idx" ON public."Purchase" USING btree ("assistanceRequestId");

-- Name: Purchase_externalAssemblyInspectionId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Purchase_externalAssemblyInspectionId_idx" ON public."Purchase" USING btree ("externalAssemblyInspectionId");

-- Name: Purchase_implementationId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Purchase_implementationId_idx" ON public."Purchase" USING btree ("implementationId");

-- Name: Purchase_implementationPurchaseItemId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Purchase_implementationPurchaseItemId_uidx" ON public."Purchase" USING btree ("implementationPurchaseItemId") WHERE ("implementationPurchaseItemId" IS NOT NULL);

-- Name: Purchase_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Purchase_orderProjectId_idx" ON public."Purchase" USING btree ("orderProjectId");

-- Name: Purchase_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Purchase_status_idx" ON public."Purchase" USING btree (status);
