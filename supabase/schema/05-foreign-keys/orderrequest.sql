-- Name: OrderRequest OrderRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: OrderRequest OrderRequest_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);

-- Name: OrderRequest OrderRequest_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);

-- Name: OrderRequest OrderRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);

-- Name: OrderRequest orderConversations_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "orderConversations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;
