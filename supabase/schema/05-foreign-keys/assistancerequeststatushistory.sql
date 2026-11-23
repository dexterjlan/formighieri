-- Name: AssistanceRequestStatusHistory AssistanceRequestStatusHistory_assistanceRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequestStatusHistory"
    ADD CONSTRAINT "AssistanceRequestStatusHistory_assistanceRequestId_fkey" FOREIGN KEY ("assistanceRequestId") REFERENCES public."AssistanceRequest"(id) ON DELETE CASCADE;

-- Name: AssistanceRequestStatusHistory AssistanceRequestStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."AssistanceRequestStatusHistory"
    ADD CONSTRAINT "AssistanceRequestStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
