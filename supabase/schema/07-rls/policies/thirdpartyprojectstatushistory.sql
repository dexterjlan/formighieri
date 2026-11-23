-- Name: ThirdPartyProjectStatusHistory authenticated_insert_ThirdPartyProjectStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ThirdPartyProjectStatusHistory" ON public."ThirdPartyProjectStatusHistory" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: ThirdPartyProjectStatusHistory authenticated_select_ThirdPartyProjectStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ThirdPartyProjectStatusHistory" ON public."ThirdPartyProjectStatusHistory" FOR SELECT TO authenticated USING (true);
