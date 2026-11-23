-- Name: OrderProject OrderProject_aggregatorOrderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_aggregatorOrderProjectId_fkey" FOREIGN KEY ("aggregatorOrderProjectId") REFERENCES public."OrderProject"(id) ON DELETE RESTRICT;

-- Name: OrderProject OrderProject_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: OrderProject OrderProject_deliveryPhaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_deliveryPhaseId_fkey" FOREIGN KEY ("deliveryPhaseId") REFERENCES public."OrderDeliveryPhase"(id) ON DELETE SET NULL;

-- Name: OrderProject OrderProject_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);

-- Name: OrderProject OrderProject_environmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_environmentTypeId_fkey" FOREIGN KEY ("environmentTypeId") REFERENCES public."EnvironmentType"(id);

-- Name: OrderProject OrderProject_marceneiroId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_marceneiroId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);

-- Name: OrderProject OrderProject_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id);

-- Name: OrderProject OrderProject_parentProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES public."OrderProject"(id);

-- Name: OrderProject OrderProject_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: OrderProject OrderProject_statusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES public."OrderProjectStatus"(id);

-- Name: OrderProject OrderProject_substituiProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_substituiProjectId_fkey" FOREIGN KEY ("replacesProjectId") REFERENCES public."OrderProject"(id);

-- Name: OrderProject OrderProject_substituidoPorProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_substituidoPorProjectId_fkey" FOREIGN KEY ("replacedByProjectId") REFERENCES public."OrderProject"(id);

-- Name: OrderProject OrderProject_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
