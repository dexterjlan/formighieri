-- Name: RevisionActivityAttachment revision_activity_attachment_authenticated_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY revision_activity_attachment_authenticated_all ON public."RevisionActivityAttachment" TO authenticated USING (true) WITH CHECK (true);
