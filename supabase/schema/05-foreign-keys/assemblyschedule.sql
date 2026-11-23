-- Name: AssemblySchedule AssemblySchedule_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "AssemblySchedule_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;

-- Name: AssemblySchedule AssemblySchedule_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "AssemblySchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);

-- Name: AssemblySchedule MontagemProgramacao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: AssemblySchedule MontagemProgramacao_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;

-- Name: AssemblySchedule MontagemProgramacao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
