-- Name: ImplementationPurchaseItem_implementationId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ImplementationPurchaseItem_implementationId_idx" ON public."ImplementationPurchaseItem" USING btree ("implementationId");

-- Name: ImplementationPurchaseItem_implementation_standard_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ImplementationPurchaseItem_implementation_standard_uidx" ON public."ImplementationPurchaseItem" USING btree ("implementationId", "purchaseType") WHERE ("purchaseType" = ANY (ARRAY['Material'::text, 'Ferragem'::text, 'Tinta'::text]));

-- Name: ImplementationPurchaseItem_implementation_terceiro_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "ImplementationPurchaseItem_implementation_terceiro_uidx" ON public."ImplementationPurchaseItem" USING btree ("implementationId", "thirdPartySubtypeId") WHERE ("purchaseType" = 'Terceiro'::text);

-- Name: ImplementationPurchaseItem_thirdPartySubtypeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ImplementationPurchaseItem_thirdPartySubtypeId_idx" ON public."ImplementationPurchaseItem" USING btree ("thirdPartySubtypeId");
