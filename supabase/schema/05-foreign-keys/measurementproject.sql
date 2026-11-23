-- Name: MeasurementProject MedicaoProject_medicaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MedicaoProject_medicaoId_fkey" FOREIGN KEY ("measurementId") REFERENCES public."Measurement"(id) ON DELETE CASCADE;

-- Name: MeasurementProject MedicaoProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MedicaoProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);
