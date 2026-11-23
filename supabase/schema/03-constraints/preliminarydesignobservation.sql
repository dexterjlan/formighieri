-- Name: PreliminaryDesignObservation PreliminaryDesignObservation_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "PreliminaryDesignObservation_pkey" PRIMARY KEY (id);

-- Name: PreliminaryDesignObservation PreliminaryDesignObservation_text_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "PreliminaryDesignObservation_text_key" UNIQUE (text);
