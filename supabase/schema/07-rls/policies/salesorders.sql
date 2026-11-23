-- Name: salesOrders authenticated_insert_salesOrders; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_salesOrders" ON public."salesOrders" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: salesOrders authenticated_select_salesOrders; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_salesOrders" ON public."salesOrders" FOR SELECT TO authenticated USING (true);
