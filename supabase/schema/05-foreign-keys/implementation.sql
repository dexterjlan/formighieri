-- Name: Implementation Implantacao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Implementation Implantacao_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: Implementation Implantacao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);

-- Name: Implementation Implementation_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
