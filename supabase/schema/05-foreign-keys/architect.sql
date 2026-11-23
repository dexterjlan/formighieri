-- Name: Architect Architect_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Architect"
    ADD CONSTRAINT "Architect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Architect Architect_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Architect"
    ADD CONSTRAINT "Architect_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
