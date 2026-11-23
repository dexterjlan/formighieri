-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_inspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES public."ExternalAssemblyInspection"(id) ON DELETE CASCADE;

-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;
