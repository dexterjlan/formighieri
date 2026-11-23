-- Name: AssemblyScheduleCabinetMaker AssemblyScheduleCabinetMaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "AssemblyScheduleCabinetMaker_pkey" PRIMARY KEY (id);

-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_programacaoId_marceneiroId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_programacaoId_marceneiroId_key" UNIQUE ("assemblyScheduleId", "cabinetMakerId");
