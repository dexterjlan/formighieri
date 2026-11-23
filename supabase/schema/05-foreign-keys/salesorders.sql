-- Name: salesOrders salesOrders_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;

-- Name: salesOrders salesOrders_architectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_architectId_fkey" FOREIGN KEY ("architectId") REFERENCES public."Architect"(id) ON DELETE SET NULL;

-- Name: salesOrders salesOrders_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);

-- Name: salesOrders salesOrders_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);

-- Name: salesOrders salesOrders_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: salesOrders salesOrders_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
