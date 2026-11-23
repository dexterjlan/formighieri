-- Name: RevisionActivityAttachment RevisionActivityAttachment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."RevisionActivityAttachment"
    ADD CONSTRAINT "RevisionActivityAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: RevisionActivityAttachment RevisionActivityAttachment_revisionActivityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."RevisionActivityAttachment"
    ADD CONSTRAINT "RevisionActivityAttachment_revisionActivityId_fkey" FOREIGN KEY ("revisionActivityId") REFERENCES public."RevisionActivity"(id) ON DELETE CASCADE;
