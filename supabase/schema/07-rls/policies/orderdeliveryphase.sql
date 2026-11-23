-- Name: OrderDeliveryPhase authenticated_delete_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR DELETE TO authenticated USING (true);

-- Name: OrderDeliveryPhase authenticated_insert_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: OrderDeliveryPhase authenticated_select_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR SELECT TO authenticated USING (true);

-- Name: OrderDeliveryPhase authenticated_update_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
