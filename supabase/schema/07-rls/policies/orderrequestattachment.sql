-- Name: OrderRequestAttachment authenticated_delete_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderRequestAttachment authenticated_insert_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderRequestAttachment authenticated_select_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR SELECT TO authenticated USING (true);
