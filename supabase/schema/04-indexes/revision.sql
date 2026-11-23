-- Name: Revision_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Revision_createdAt_idx" ON public."Revision" USING btree ("createdAt" DESC);

-- Name: Revision_one_open_per_subject_type_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Revision_one_open_per_subject_type_uidx" ON public."Revision" USING btree (COALESCE("orderProjectId", (0)::bigint), COALESCE("thirdPartyProjectId", (0)::bigint), "revisionType") WHERE (status = 'open'::public."RevisionRecordStatus");

-- Name: Revision_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Revision_orderProjectId_idx" ON public."Revision" USING btree ("orderProjectId");

-- Name: Revision_revisionType_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Revision_revisionType_idx" ON public."Revision" USING btree ("revisionType");

-- Name: Revision_thirdPartyProjectId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Revision_thirdPartyProjectId_idx" ON public."Revision" USING btree ("thirdPartyProjectId");
