-- Name: ExpeditionRoute ExpeditionRoute_confirmedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES public."appUsers"(id);

-- Name: ExpeditionRoute ExpeditionRoute_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: ExpeditionRoute ExpeditionRoute_responsibleUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
