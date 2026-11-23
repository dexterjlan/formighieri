-- Name: OrderProjectSubstatus OrderProjectSubstatus_endedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: OrderProjectSubstatus OrderProjectSubstatus_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: OrderProjectSubstatus OrderProjectSubstatus_startedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
