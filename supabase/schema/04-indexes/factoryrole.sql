-- Name: FactoryRole_isActive_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryRole_isActive_idx" ON public."FactoryRole" USING btree ("isActive");

-- Name: FactoryRole_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryRole_sortOrder_idx" ON public."FactoryRole" USING btree ("sortOrder");
