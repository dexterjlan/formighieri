-- Name: ProjectProductionQueue authenticated_select_projectproductionqueue; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY authenticated_select_projectproductionqueue ON public."ProjectProductionQueue" FOR SELECT TO authenticated USING (true);
