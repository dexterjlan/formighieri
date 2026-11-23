-- Name: DriveFile DriveFile_select_authenticated; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "DriveFile_select_authenticated" ON public."DriveFile" FOR SELECT TO authenticated USING (true);

-- Name: DriveFile DriveFile_write_authenticated; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "DriveFile_write_authenticated" ON public."DriveFile" TO authenticated USING (true) WITH CHECK (true);
