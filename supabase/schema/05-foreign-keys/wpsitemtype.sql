-- Name: WpsItemType WpsItemType_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: WpsItemType WpsItemType_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
