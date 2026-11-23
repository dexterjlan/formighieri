-- Name: PreliminaryDesignModuleObservation AnteprojetoModuleObservation_moduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignModuleObservation"
    ADD CONSTRAINT "AnteprojetoModuleObservation_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES public."PreliminaryDesignModule"(id) ON DELETE CASCADE;

-- Name: PreliminaryDesignModuleObservation AnteprojetoModuleObservation_observationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignModuleObservation"
    ADD CONSTRAINT "AnteprojetoModuleObservation_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES public."PreliminaryDesignObservation"(id);
