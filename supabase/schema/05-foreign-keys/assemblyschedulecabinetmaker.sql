-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_marceneiroId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_marceneiroId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE RESTRICT;

-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_programacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_programacaoId_fkey" FOREIGN KEY ("assemblyScheduleId") REFERENCES public."AssemblySchedule"(id) ON DELETE CASCADE;
