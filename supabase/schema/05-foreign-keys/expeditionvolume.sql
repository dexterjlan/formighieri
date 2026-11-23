-- Name: ExpeditionVolume ExpeditionVolume_boardedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_boardedById_fkey" FOREIGN KEY ("boardedById") REFERENCES public."appUsers"(id);

-- Name: ExpeditionVolume ExpeditionVolume_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;

-- Name: ExpeditionVolume ExpeditionVolume_stopItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_stopItemId_fkey" FOREIGN KEY ("stopItemId") REFERENCES public."ExpeditionRouteStopItem"(id) ON DELETE CASCADE;

-- Name: ExpeditionVolume ExpeditionVolume_unloadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_unloadedById_fkey" FOREIGN KEY ("unloadedById") REFERENCES public."appUsers"(id);
