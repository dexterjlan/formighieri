-- Name: PartRequestStatusHistory PartRequestStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequestStatusHistory"
    ADD CONSTRAINT "PartRequestStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);

-- Name: PartRequestStatusHistory PartRequestStatusHistory_partRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PartRequestStatusHistory"
    ADD CONSTRAINT "PartRequestStatusHistory_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES public."PartRequest"(id) ON DELETE CASCADE;
