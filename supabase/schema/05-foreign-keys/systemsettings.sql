-- Name: SystemSettings SystemSettings_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
