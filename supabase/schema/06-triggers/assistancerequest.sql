-- Name: AssistanceRequest assistance_request_status_history_after_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER assistance_request_status_history_after_insert AFTER INSERT ON public."AssistanceRequest" FOR EACH ROW EXECUTE FUNCTION public.append_assistance_request_status_history();

-- Name: AssistanceRequest assistance_request_status_history_after_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER assistance_request_status_history_after_update AFTER UPDATE OF status ON public."AssistanceRequest" FOR EACH ROW EXECUTE FUNCTION public.append_assistance_request_status_history();
