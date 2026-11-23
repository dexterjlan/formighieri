-- Name: ThirdPartySubtype ThirdPartySubtype_projectCharacteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ThirdPartySubtype"
    ADD CONSTRAINT "ThirdPartySubtype_projectCharacteristicId_fkey" FOREIGN KEY ("projectCharacteristicId") REFERENCES public."ProjectCharacteristic"(id);
