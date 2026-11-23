-- Name: addr_labelid_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX addr_labelid_idx ON public.addr USING btree ("labelId");

-- Name: addr_one_primary_per_owner_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX addr_one_primary_per_owner_idx ON public.addr USING btree ("ownerType", "ownerId") WHERE ("isPrimary" AND "isActive");

-- Name: addr_owner_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX addr_owner_idx ON public.addr USING btree ("ownerType", "ownerId");

-- Name: addr_postalcode_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX addr_postalcode_idx ON public.addr USING btree ("postalCode");
