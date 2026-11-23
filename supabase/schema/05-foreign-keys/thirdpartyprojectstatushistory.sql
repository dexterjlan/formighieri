-- Name: ThirdPartyProjectStatusHistory ThirdPartyProjectStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProjectStatusHistory"
    ADD CONSTRAINT "ThirdPartyProjectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);

-- Name: ThirdPartyProjectStatusHistory ThirdPartyProjectStatusHistory_thirdPartyProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProjectStatusHistory"
    ADD CONSTRAINT "ThirdPartyProjectStatusHistory_thirdPartyProjectId_fkey" FOREIGN KEY ("thirdPartyProjectId") REFERENCES public."ThirdPartyProject"(id) ON DELETE CASCADE;
