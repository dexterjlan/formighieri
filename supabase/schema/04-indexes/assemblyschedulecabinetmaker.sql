-- Name: MontagemProgramacaoMarceneiro_marceneiroId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacaoMarceneiro_marceneiroId_idx" ON public."AssemblyScheduleCabinetMaker" USING btree ("cabinetMakerId");

-- Name: MontagemProgramacaoMarceneiro_programacaoId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacaoMarceneiro_programacaoId_idx" ON public."AssemblyScheduleCabinetMaker" USING btree ("assemblyScheduleId");
