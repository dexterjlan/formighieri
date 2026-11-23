-- Name: RevisionActivity revision_activity_authenticated_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY revision_activity_authenticated_all ON public."RevisionActivity" TO authenticated USING (true) WITH CHECK (true);
