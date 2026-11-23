-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_orderProjectId_key" UNIQUE ("orderProjectId");

-- Name: PreliminaryDesignConferenceProject PreliminaryDesignConferenceProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "PreliminaryDesignConferenceProject_pkey" PRIMARY KEY (id);
