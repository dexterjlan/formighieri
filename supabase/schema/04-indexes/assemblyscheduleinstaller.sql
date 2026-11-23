-- Name: MontagemProgramacaoMontador_montadorId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacaoMontador_montadorId_idx" ON public."AssemblyScheduleInstaller" USING btree ("installerId");

-- Name: MontagemProgramacaoMontador_programacaoId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "MontagemProgramacaoMontador_programacaoId_idx" ON public."AssemblyScheduleInstaller" USING btree ("assemblyScheduleId");
