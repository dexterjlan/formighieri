-- Name: PreliminaryDesignConferenceHistory_conferenceId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PreliminaryDesignConferenceHistory_conferenceId_idx" ON public."PreliminaryDesignConferenceHistory" USING btree ("conferenceId");

-- Name: PreliminaryDesignConferenceHistory_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "PreliminaryDesignConferenceHistory_createdAt_idx" ON public."PreliminaryDesignConferenceHistory" USING btree ("createdAt" DESC);
