-- Name: RevisionActivity RevisionActivity_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."RevisionActivity"
    ADD CONSTRAINT "RevisionActivity_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."Revision"(id) ON DELETE CASCADE;
