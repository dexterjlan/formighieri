-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_completedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES public."appUsers"(id);

-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;
