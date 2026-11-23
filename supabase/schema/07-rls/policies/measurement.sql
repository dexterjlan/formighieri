-- Name: Measurement authenticated_delete_Medicao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Medicao" ON public."Measurement" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: Measurement authenticated_insert_Medicao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Medicao" ON public."Measurement" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: Measurement authenticated_select_Medicao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Medicao" ON public."Measurement" FOR SELECT TO authenticated USING (true);

-- Name: Measurement authenticated_update_Medicao; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Medicao" ON public."Measurement" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
