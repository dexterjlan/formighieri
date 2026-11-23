-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);

-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_statusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES public."OrderProjectStatus"(id) ON DELETE RESTRICT;

-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);

-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."appUsers"(id);
