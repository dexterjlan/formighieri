-- Name: Revision revision_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER revision_activity_log_trg AFTER UPDATE ON public."Revision" FOR EACH ROW EXECUTE FUNCTION public.trg_revision_activity_log();
