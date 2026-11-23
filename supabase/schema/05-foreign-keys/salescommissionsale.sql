-- Name: SalesCommissionSale SalesCommissionSale_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);

-- Name: SalesCommissionSale SalesCommissionSale_importedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES public."appUsers"(id);

-- Name: SalesCommissionSale SalesCommissionSale_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;
