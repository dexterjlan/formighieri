-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_budgetInProgressById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_budgetInProgressById_fkey" FOREIGN KEY ("budgetInProgressById") REFERENCES public."appUsers"(id);

-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_registeredById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES public."appUsers"(id);

-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_sentById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES public."appUsers"(id);

-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);

-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_wpsItemTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_wpsItemTypeId_fkey" FOREIGN KEY ("wpsItemTypeId") REFERENCES public."WpsItemType"(id);
