-- Name: DriveFile DriveFile_driveFileId_key; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DriveFile"
    ADD CONSTRAINT "DriveFile_driveFileId_key" UNIQUE ("driveFileId");

-- Name: DriveFile DriveFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."DriveFile"
    ADD CONSTRAINT "DriveFile_pkey" PRIMARY KEY (id);
