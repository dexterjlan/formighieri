-- Name: OrderProjectStatusHistory authenticated_delete_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: OrderProjectStatusHistory authenticated_insert_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: OrderProjectStatusHistory authenticated_select_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR SELECT TO authenticated USING (true);
