-- Name: RevisionActivityAttachment_activity_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "RevisionActivityAttachment_activity_uidx" ON public."RevisionActivityAttachment" USING btree ("revisionActivityId");

-- Name: RevisionActivityAttachment_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "RevisionActivityAttachment_createdAt_idx" ON public."RevisionActivityAttachment" USING btree ("createdAt");
