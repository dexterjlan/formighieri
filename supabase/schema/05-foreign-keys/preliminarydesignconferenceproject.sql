-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_conferenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES public."PreliminaryDesignConference"(id) ON DELETE CASCADE;

-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);
