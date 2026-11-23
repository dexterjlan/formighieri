-- Name: FactoryEmployee FactoryEmployee_factoryRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_factoryRoleId_fkey" FOREIGN KEY ("factoryRoleId") REFERENCES public."FactoryRole"(id) ON DELETE RESTRICT;

-- Name: FactoryEmployee FactoryEmployee_legacyCabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_legacyCabinetMakerId_fkey" FOREIGN KEY ("legacyCabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE SET NULL;
