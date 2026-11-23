-- Name: DealActivity DealActivity_calendarEventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES public."CalendarEvent"(id) ON DELETE SET NULL;

-- Name: DealActivity DealActivity_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: DealActivity DealActivity_dealId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES public."Deal"(id) ON DELETE CASCADE;

-- Name: DealActivity DealActivity_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: DealActivity DealActivity_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
