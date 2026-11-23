-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_inspection_project_uidx; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_inspection_project_uidx" UNIQUE ("inspectionId", "orderProjectId");

-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_pkey" PRIMARY KEY (id);
