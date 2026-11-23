-- Name: Revision Revision_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Revision Revision_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: Revision Revision_thirdPartyProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_thirdPartyProjectId_fkey" FOREIGN KEY ("thirdPartyProjectId") REFERENCES public."ThirdPartyProject"(id) ON DELETE CASCADE;

-- Name: Revision Revision_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
