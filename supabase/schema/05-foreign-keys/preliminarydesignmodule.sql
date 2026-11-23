-- Name: PreliminaryDesignModule AnteprojetoModule_conferenceProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignModule"
    ADD CONSTRAINT "AnteprojetoModule_conferenceProjectId_fkey" FOREIGN KEY ("conferenceProjectId") REFERENCES public."PreliminaryDesignConferenceProject"(id) ON DELETE CASCADE;
