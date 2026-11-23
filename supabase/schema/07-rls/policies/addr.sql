-- Name: addr authenticated_delete_addr; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_delete_addr ON public.addr FOR DELETE TO authenticated USING (true);

-- Name: addr authenticated_insert_addr; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_insert_addr ON public.addr FOR INSERT TO authenticated WITH CHECK (true);

-- Name: addr authenticated_select_addr; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_addr ON public.addr FOR SELECT TO authenticated USING (true);

-- Name: addr authenticated_update_addr; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_update_addr ON public.addr FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
