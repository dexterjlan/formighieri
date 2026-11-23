-- Name: Contact_one_primary_uidx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Contact_one_primary_uidx" ON public."Contact" USING btree ("ownerType", "ownerId") WHERE ("isPrimary" IS TRUE);

-- Name: Contact_owner_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "Contact_owner_idx" ON public."Contact" USING btree ("ownerType", "ownerId", "isPrimary" DESC, id);
