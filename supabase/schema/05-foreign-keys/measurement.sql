-- Name: Measurement Medicao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: Measurement Medicao_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;

-- Name: Measurement Medicao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
