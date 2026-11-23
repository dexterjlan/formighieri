-- Name: DealLostReason authenticated_delete_deallostreason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_deallostreason ON public."DealLostReason" FOR DELETE TO authenticated USING (true);

-- Name: DealLostReason authenticated_insert_deallostreason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_deallostreason ON public."DealLostReason" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: DealLostReason authenticated_select_deallostreason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_deallostreason ON public."DealLostReason" FOR SELECT TO authenticated USING (true);

-- Name: DealLostReason authenticated_update_deallostreason; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_deallostreason ON public."DealLostReason" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
