-- Name: ProjectProductionQueue ProjectProductionQueue_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: ProjectProductionQueue ProjectProductionQueue_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
