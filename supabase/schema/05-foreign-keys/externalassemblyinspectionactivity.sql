-- Name: ExternalAssemblyInspectionActivity ExternalAssemblyInspectionActivity_doneById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity"
    ADD CONSTRAINT "ExternalAssemblyInspectionActivity_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;

-- Name: ExternalAssemblyInspectionActivity ExternalAssemblyInspectionActivity_inspectionProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity"
    ADD CONSTRAINT "ExternalAssemblyInspectionActivity_inspectionProjectId_fkey" FOREIGN KEY ("inspectionProjectId") REFERENCES public."ExternalAssemblyInspectionProject"(id) ON DELETE CASCADE;
