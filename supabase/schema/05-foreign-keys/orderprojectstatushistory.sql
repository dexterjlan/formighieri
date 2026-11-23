-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);

-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_newStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_newStatusId_fkey" FOREIGN KEY ("newStatusId") REFERENCES public."OrderProjectStatus"(id);

-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_previousStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_previousStatusId_fkey" FOREIGN KEY ("previousStatusId") REFERENCES public."OrderProjectStatus"(id);
