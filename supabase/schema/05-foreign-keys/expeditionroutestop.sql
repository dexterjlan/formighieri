-- Name: ExpeditionRouteStop ExpeditionRouteStop_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRouteStop"
    ADD CONSTRAINT "ExpeditionRouteStop_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id);

-- Name: ExpeditionRouteStop ExpeditionRouteStop_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExpeditionRouteStop"
    ADD CONSTRAINT "ExpeditionRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;
