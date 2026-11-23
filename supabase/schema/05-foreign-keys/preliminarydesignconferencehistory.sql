-- Name: PreliminaryDesignConferenceHistory AnteprojetoConferenceHistory_conferenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceHistory"
    ADD CONSTRAINT "AnteprojetoConferenceHistory_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES public."PreliminaryDesignConference"(id) ON DELETE CASCADE;

-- Name: PreliminaryDesignConferenceHistory AnteprojetoConferenceHistory_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceHistory"
    ADD CONSTRAINT "AnteprojetoConferenceHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);
