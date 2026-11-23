-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_salesCommissionSaleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_salesCommissionSaleId_fkey" FOREIGN KEY ("salesCommissionSaleId") REFERENCES public."SalesCommissionSale"(id) ON DELETE CASCADE;
