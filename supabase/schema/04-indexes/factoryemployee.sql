-- Name: FactoryEmployee_factoryRoleId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryEmployee_factoryRoleId_idx" ON public."FactoryEmployee" USING btree ("factoryRoleId");

-- Name: FactoryEmployee_isActive_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryEmployee_isActive_idx" ON public."FactoryEmployee" USING btree ("isActive");

-- Name: FactoryEmployee_name_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryEmployee_name_idx" ON public."FactoryEmployee" USING btree (name);

-- Name: FactoryEmployee_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "FactoryEmployee_sortOrder_idx" ON public."FactoryEmployee" USING btree ("sortOrder");
