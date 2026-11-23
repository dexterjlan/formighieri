-- Name: addrlabel addrlabel_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public.addrlabel
    ADD CONSTRAINT "addrlabel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: addrlabel addrlabel_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public.addrlabel
    ADD CONSTRAINT "addrlabel_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
