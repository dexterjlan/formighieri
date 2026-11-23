-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_implantacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_implantacaoId_fkey" FOREIGN KEY ("implementationId") REFERENCES public."Implementation"(id) ON DELETE CASCADE;

-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);

-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
