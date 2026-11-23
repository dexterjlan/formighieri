-- Name: WpsItemRegistrationRequest_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WpsItemRegistrationRequest_createdAt_idx" ON public."WpsItemRegistrationRequest" USING btree ("createdAt" DESC);

-- Name: WpsItemRegistrationRequest_status_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WpsItemRegistrationRequest_status_idx" ON public."WpsItemRegistrationRequest" USING btree (status);

-- Name: WpsItemRegistrationRequest_wpsItemTypeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "WpsItemRegistrationRequest_wpsItemTypeId_idx" ON public."WpsItemRegistrationRequest" USING btree ("wpsItemTypeId");
