-- Name: Detailing authenticated_delete_Detailing; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_Detailing" ON public."Detailing" FOR DELETE TO authenticated USING (true);

-- Name: Detailing authenticated_insert_Detailing; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_Detailing" ON public."Detailing" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: Detailing authenticated_select_Detailing; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_Detailing" ON public."Detailing" FOR SELECT TO authenticated USING (true);

-- Name: Detailing authenticated_update_Detailing; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_Detailing" ON public."Detailing" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
