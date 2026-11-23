-- Name: ThirdPartyProject ThirdPartyProject_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: ThirdPartyProject ThirdPartyProject_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);

-- Name: ThirdPartyProject ThirdPartyProject_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;

-- Name: ThirdPartyProject ThirdPartyProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: ThirdPartyProject ThirdPartyProject_projectCharacteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_projectCharacteristicId_fkey" FOREIGN KEY ("projectCharacteristicId") REFERENCES public."ProjectCharacteristic"(id);

-- Name: ThirdPartyProject ThirdPartyProject_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);

-- Name: ThirdPartyProject ThirdPartyProject_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
