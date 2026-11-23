-- Name: PartRequest part_request_status_history_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER part_request_status_history_trg AFTER INSERT OR UPDATE OF status ON public."PartRequest" FOR EACH ROW EXECUTE FUNCTION public.trg_part_request_status_history();
