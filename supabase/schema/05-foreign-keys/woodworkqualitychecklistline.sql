-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_catalogItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES public."WoodworkQualityChecklistItem"(id) ON DELETE SET NULL;

-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_checklistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES public."WoodworkQualityChecklist"(id) ON DELETE CASCADE;
