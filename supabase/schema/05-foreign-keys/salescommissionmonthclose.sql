-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_closedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES public."appUsers"(id);
