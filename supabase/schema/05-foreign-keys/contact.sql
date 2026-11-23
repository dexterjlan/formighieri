-- Name: Contact Contact_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Contact Contact_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
