-- Name: OrderProjectCharacteristic authenticated_delete_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR DELETE TO authenticated USING (true);

-- Name: OrderProjectCharacteristic authenticated_insert_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: OrderProjectCharacteristic authenticated_select_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR SELECT TO authenticated USING (true);

-- Name: OrderProjectCharacteristic authenticated_update_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
