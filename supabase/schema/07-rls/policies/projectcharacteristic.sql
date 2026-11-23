-- Name: ProjectCharacteristic authenticated_delete_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR DELETE TO authenticated USING (true);

-- Name: ProjectCharacteristic authenticated_insert_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: ProjectCharacteristic authenticated_select_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR SELECT TO authenticated USING (true);

-- Name: ProjectCharacteristic authenticated_update_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
