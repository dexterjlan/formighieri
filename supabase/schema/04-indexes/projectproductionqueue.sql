-- Name: ProjectProductionQueue_sequence_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "ProjectProductionQueue_sequence_idx" ON public."ProjectProductionQueue" USING btree (sequence, id);
