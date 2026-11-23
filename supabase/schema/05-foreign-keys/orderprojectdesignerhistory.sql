-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);

-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_newDesignerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_newDesignerId_fkey" FOREIGN KEY ("newDesignerId") REFERENCES public."appUsers"(id);

-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;

-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_previousDesignerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_previousDesignerId_fkey" FOREIGN KEY ("previousDesignerId") REFERENCES public."appUsers"(id);
