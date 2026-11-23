-- Name: OrderDeliveryPhase OrderDeliveryPhase_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderDeliveryPhase"
    ADD CONSTRAINT "OrderDeliveryPhase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;
