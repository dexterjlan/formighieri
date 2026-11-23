-- Name: PartRequestStatusHistory authenticated_insert_PartRequestStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_PartRequestStatusHistory" ON public."PartRequestStatusHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: PartRequestStatusHistory authenticated_select_PartRequestStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_PartRequestStatusHistory" ON public."PartRequestStatusHistory" FOR SELECT TO authenticated USING (true);
