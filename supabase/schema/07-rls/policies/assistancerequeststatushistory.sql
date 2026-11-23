-- Name: AssistanceRequestStatusHistory authenticated_select_AssistanceRequestStatusHistory; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_AssistanceRequestStatusHistory" ON public."AssistanceRequestStatusHistory" FOR SELECT TO authenticated USING (true);
