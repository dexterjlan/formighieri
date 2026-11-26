-- Name: PartRequest PartRequest_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);

-- Name: PartRequest PartRequest_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);

-- Name: PartRequest PartRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: PartRequest PartRequest_factoryEmployeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_factoryEmployeeId_fkey" FOREIGN KEY ("factoryEmployeeId") REFERENCES public."FactoryEmployee"(id) ON DELETE SET NULL;

-- Name: PartRequest PartRequest_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_montadorId_fkey" FOREIGN KEY ("montadorId") REFERENCES public."Installer"(id) ON DELETE SET NULL;

-- Name: PartRequest PartRequest_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id);

-- Name: PartRequest PartRequest_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE SET NULL;

-- Name: PartRequest PartRequest_externalAssemblyInspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_externalAssemblyInspectionId_fkey" FOREIGN KEY ("externalAssemblyInspectionId") REFERENCES public."ExternalAssemblyInspection"(id) ON DELETE SET NULL;

-- Name: PartRequest PartRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
