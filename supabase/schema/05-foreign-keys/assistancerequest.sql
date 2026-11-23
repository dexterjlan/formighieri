-- Name: AssistanceRequest AssistanceRequest_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;

-- Name: AssistanceRequest AssistanceRequest_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE SET NULL;

-- Name: AssistanceRequest AssistanceRequest_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);

-- Name: AssistanceRequest AssistanceRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: AssistanceRequest AssistanceRequest_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_montadorId_fkey" FOREIGN KEY ("montadorId") REFERENCES public."Installer"(id) ON DELETE SET NULL;

-- Name: AssistanceRequest AssistanceRequest_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;

-- Name: AssistanceRequest AssistanceRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
