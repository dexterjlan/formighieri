-- Name: SalesCommissionManagerTier SalesCommissionManagerTier_salesMonthlyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionManagerTier"
    ADD CONSTRAINT "SalesCommissionManagerTier_salesMonthlyTargetId_fkey" FOREIGN KEY ("salesMonthlyTargetId") REFERENCES public."SalesMonthlyTarget"(id) ON DELETE CASCADE;
