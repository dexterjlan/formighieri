-- Name: PreliminaryDesignObservation AnteprojetoObservation_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "AnteprojetoObservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);
