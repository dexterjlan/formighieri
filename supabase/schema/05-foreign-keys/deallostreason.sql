-- Name: DealLostReason DealLostReason_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealLostReason"
    ADD CONSTRAINT "DealLostReason_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: DealLostReason DealLostReason_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealLostReason"
    ADD CONSTRAINT "DealLostReason_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
