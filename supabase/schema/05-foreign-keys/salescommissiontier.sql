-- Name: SalesCommissionTier SalesCommissionTier_salesMonthlyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionTier"
    ADD CONSTRAINT "SalesCommissionTier_salesMonthlyTargetId_fkey" FOREIGN KEY ("salesMonthlyTargetId") REFERENCES public."SalesMonthlyTarget"(id) ON DELETE CASCADE;
