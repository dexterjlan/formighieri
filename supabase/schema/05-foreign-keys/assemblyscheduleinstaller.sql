-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_montadorId_fkey" FOREIGN KEY ("installerId") REFERENCES public."Installer"(id) ON DELETE RESTRICT;

-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_programacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_programacaoId_fkey" FOREIGN KEY ("assemblyScheduleId") REFERENCES public."AssemblySchedule"(id) ON DELETE CASCADE;
