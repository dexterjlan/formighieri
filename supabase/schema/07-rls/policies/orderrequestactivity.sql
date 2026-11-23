-- Name: OrderRequestActivity authenticated_delete_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderRequestActivity" ON public."OrderRequestActivity" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderRequestActivity authenticated_insert_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderRequestActivity" ON public."OrderRequestActivity" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderRequestActivity authenticated_select_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderRequestActivity" ON public."OrderRequestActivity" FOR SELECT TO authenticated USING (true);

-- Name: OrderRequestActivity authenticated_update_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderRequestActivity" ON public."OrderRequestActivity" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
