-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_characteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES public."ProjectCharacteristic"(id) ON DELETE RESTRICT;

-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;
