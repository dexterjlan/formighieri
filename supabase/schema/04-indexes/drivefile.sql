-- Name: DriveFile_assistance_quote_entity_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DriveFile_assistance_quote_entity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'assistanceQuote'::text) AND ("entityType" = 'AssistanceRequest'::text));

-- Name: DriveFile_entity_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DriveFile_entity_idx" ON public."DriveFile" USING btree ("entityType", "entityId");

-- Name: DriveFile_folderKind_entity_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DriveFile_folderKind_entity_idx" ON public."DriveFile" USING btree ("folderKind", "entityType", "entityId");

-- Name: DriveFile_implementation_list_entity_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DriveFile_implementation_list_entity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'implementationList'::text) AND ("entityType" = 'ImplementationPurchaseItem'::text));

-- Name: DriveFile_orderProject_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DriveFile_orderProject_idx" ON public."DriveFile" USING btree ("orderProjectId");

-- Name: DriveFile_request_activity_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DriveFile_request_activity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'request'::text) AND ("entityType" = 'OrderRequestActivity'::text));

-- Name: DriveFile_revision_activity_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DriveFile_revision_activity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'revision'::text) AND ("entityType" = 'RevisionActivity'::text));

-- Name: DriveFile_storagePath_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DriveFile_storagePath_uidx" ON public."DriveFile" USING btree ("storagePath") WHERE ("storagePath" IS NOT NULL);
