-- Name: Detailing Detailing_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Detailing Detailing_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);

-- Name: Detailing Detailing_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: Detailing Detailing_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
