-- Name: OrderProjectSubstatus authenticated_delete_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderProjectSubstatus authenticated_insert_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderProjectSubstatus authenticated_select_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR SELECT TO authenticated USING (true);

-- Name: OrderProjectSubstatus authenticated_update_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
