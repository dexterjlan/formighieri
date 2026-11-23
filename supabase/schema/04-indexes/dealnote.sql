-- Name: DealNote_dealId_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "DealNote_dealId_createdAt_idx" ON public."DealNote" USING btree ("dealId", "createdAt" DESC);

-- Name: DealNote_pipedriveNoteId_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "DealNote_pipedriveNoteId_uidx" ON public."DealNote" USING btree ("pipedriveNoteId") WHERE ("pipedriveNoteId" IS NOT NULL);
