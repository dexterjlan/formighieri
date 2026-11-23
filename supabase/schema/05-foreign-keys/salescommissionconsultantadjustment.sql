-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionConsultantAdjustment"
    ADD CONSTRAINT "SalesCommissionConsultantAdjustment_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);

-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."SalesCommissionConsultantAdjustment"
    ADD CONSTRAINT "SalesCommissionConsultantAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."appUsers"(id);
