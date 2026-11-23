-- Name: AssemblyScheduleInstaller AssemblyScheduleInstaller_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "AssemblyScheduleInstaller_pkey" PRIMARY KEY (id);

-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_programacaoId_montadorId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_programacaoId_montadorId_key" UNIQUE ("assemblyScheduleId", "installerId");
