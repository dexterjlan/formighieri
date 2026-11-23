-- Name: OrderRequestAttachment OrderRequestAttachment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: OrderRequestAttachment OrderRequestAttachment_orderRequestActivityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_orderRequestActivityId_fkey" FOREIGN KEY ("orderRequestActivityId") REFERENCES public."OrderRequestActivity"(id) ON DELETE CASCADE;

-- Name: OrderRequestAttachment OrderRequestAttachment_orderRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES public."OrderRequest"(id) ON DELETE CASCADE;
