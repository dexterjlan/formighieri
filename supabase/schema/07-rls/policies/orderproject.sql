-- Name: OrderProject authenticated_delete_OrderProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderProject" ON public."OrderProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderProject authenticated_insert_OrderProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderProject" ON public."OrderProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderProject authenticated_select_OrderProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderProject" ON public."OrderProject" FOR SELECT TO authenticated USING (true);

-- Name: OrderProject authenticated_update_OrderProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderProject" ON public."OrderProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
