-- Name: CalendarEvent CalendarEvent_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;

-- Name: CalendarEvent CalendarEvent_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);

-- Name: CalendarEvent CalendarEvent_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: CalendarEvent CalendarEvent_eventTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES public."CalendarEventType"(id);

-- Name: CalendarEvent CalendarEvent_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;

-- Name: CalendarEvent CalendarEvent_responsibleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES public."appUsers"(id);

-- Name: CalendarEvent CalendarEvent_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
