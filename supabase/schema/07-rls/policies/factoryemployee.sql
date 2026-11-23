-- Name: FactoryEmployee authenticated_delete_FactoryEmployee; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_FactoryEmployee" ON public."FactoryEmployee" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: FactoryEmployee authenticated_insert_FactoryEmployee; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_FactoryEmployee" ON public."FactoryEmployee" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: FactoryEmployee authenticated_select_FactoryEmployee; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_FactoryEmployee" ON public."FactoryEmployee" FOR SELECT TO authenticated USING (true);

-- Name: FactoryEmployee authenticated_update_FactoryEmployee; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_FactoryEmployee" ON public."FactoryEmployee" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
