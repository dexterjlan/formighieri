-- Name: SalesCommissionEntry SalesCommissionEntry_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);

-- Name: SalesCommissionEntry SalesCommissionEntry_monthCloseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_monthCloseId_fkey" FOREIGN KEY ("monthCloseId") REFERENCES public."SalesCommissionMonthClose"(id) ON DELETE CASCADE;

-- Name: SalesCommissionEntry SalesCommissionEntry_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id);
