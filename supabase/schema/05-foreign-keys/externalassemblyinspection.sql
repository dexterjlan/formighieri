-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;

-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
