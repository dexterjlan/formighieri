-- Name: ActivityLog ActivityLog_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;
