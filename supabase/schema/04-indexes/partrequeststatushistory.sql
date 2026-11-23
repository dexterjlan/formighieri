-- Name: PartRequestStatusHistory_partRequestId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PartRequestStatusHistory_partRequestId_idx" ON public."PartRequestStatusHistory" USING btree ("partRequestId", "changedAt");
