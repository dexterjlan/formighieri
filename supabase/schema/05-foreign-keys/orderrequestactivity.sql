-- Name: OrderRequestActivity OrderRequestActivity_orderRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequestActivity"
    ADD CONSTRAINT "OrderRequestActivity_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES public."OrderRequest"(id) ON DELETE CASCADE;
