-- Name: OrderProjectStatus authenticated_delete_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderProjectStatus" ON public."OrderProjectStatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderProjectStatus authenticated_insert_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderProjectStatus" ON public."OrderProjectStatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderProjectStatus authenticated_select_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderProjectStatus" ON public."OrderProjectStatus" FOR SELECT TO authenticated USING (true);

-- Name: OrderProjectStatus authenticated_update_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderProjectStatus" ON public."OrderProjectStatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
