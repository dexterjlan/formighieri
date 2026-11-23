-- Name: DealStage DealStage_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealStage"
    ADD CONSTRAINT "DealStage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: DealStage DealStage_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealStage"
    ADD CONSTRAINT "DealStage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
