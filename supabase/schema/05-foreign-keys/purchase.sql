-- Name: Purchase Compras_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Purchase Compras_implantacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_implantacaoId_fkey" FOREIGN KEY ("implementationId") REFERENCES public."Implementation"(id) ON DELETE CASCADE;

-- Name: Purchase Compras_implantacaoPurchaseItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_implantacaoPurchaseItemId_fkey" FOREIGN KEY ("implementationPurchaseItemId") REFERENCES public."ImplementationPurchaseItem"(id);

-- Name: Purchase Compras_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: Purchase Compras_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);

-- Name: Purchase Purchase_assistanceRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_assistanceRequestId_fkey" FOREIGN KEY ("assistanceRequestId") REFERENCES public."AssistanceRequest"(id) ON DELETE SET NULL;

-- Name: Purchase Purchase_externalAssemblyInspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_externalAssemblyInspectionId_fkey" FOREIGN KEY ("externalAssemblyInspectionId") REFERENCES public."ExternalAssemblyInspection"(id) ON DELETE SET NULL;

-- Name: Purchase Purchase_purchaseReasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_purchaseReasonId_fkey" FOREIGN KEY ("purchaseReasonId") REFERENCES public."PurchaseReason"(id);

-- Name: Purchase Purchase_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);
