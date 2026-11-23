-- Name: addr addr_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);

-- Name: addr addr_labelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES public.addrlabel(id);

-- Name: addr addr_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);
