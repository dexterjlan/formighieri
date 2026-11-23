-- Name: PreliminaryDesignConference AnteprojetoConference_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."appUsers"(id);

-- Name: PreliminaryDesignConference AnteprojetoConference_confirmedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES public."appUsers"(id);

-- Name: PreliminaryDesignConference AnteprojetoConference_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: PreliminaryDesignConference AnteprojetoConference_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);

-- Name: PreliminaryDesignConference AnteprojetoConference_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;

-- Name: PreliminaryDesignConference AnteprojetoConference_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
