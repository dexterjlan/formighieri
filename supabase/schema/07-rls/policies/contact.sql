-- Name: Contact authenticated_delete_contact; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_contact ON public."Contact" FOR DELETE TO authenticated USING (true);

-- Name: Contact authenticated_insert_contact; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_contact ON public."Contact" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: Contact authenticated_select_contact; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_contact ON public."Contact" FOR SELECT TO authenticated USING (true);

-- Name: Contact authenticated_update_contact; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_contact ON public."Contact" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
