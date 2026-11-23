-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;
