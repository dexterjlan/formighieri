-- Name: designers authenticated_select_designers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_designers ON public.designers FOR SELECT TO authenticated USING (true);
