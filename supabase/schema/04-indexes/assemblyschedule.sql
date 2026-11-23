-- Name: AssemblySchedule_addrId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AssemblySchedule_addrId_idx" ON public."AssemblySchedule" USING btree ("addrId");

-- Name: MontagemProgramacao_endDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacao_endDate_idx" ON public."AssemblySchedule" USING btree ("endDate");

-- Name: MontagemProgramacao_startDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacao_startDate_idx" ON public."AssemblySchedule" USING btree ("startDate");
