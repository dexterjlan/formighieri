-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_pickupUnloadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_pickupUnloadedById_fkey" FOREIGN KEY ("pickupUnloadedById") REFERENCES public."appUsers"(id);

-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;

-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_stopId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES public."ExpeditionRouteStop"(id) ON DELETE CASCADE;
