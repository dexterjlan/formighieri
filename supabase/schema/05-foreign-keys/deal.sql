-- Name: Deal Deal_architectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_architectId_fkey" FOREIGN KEY ("architectId") REFERENCES public."Architect"(id) ON DELETE SET NULL;

-- Name: Deal Deal_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON DELETE SET NULL;

-- Name: Deal Deal_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Deal Deal_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;

-- Name: Deal Deal_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: Deal Deal_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."DealStage"(id);

-- Name: Deal Deal_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
