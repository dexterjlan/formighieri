-- Name: Revision revision_authenticated_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY revision_authenticated_all ON public."Revision" TO authenticated USING (true) WITH CHECK (true);
