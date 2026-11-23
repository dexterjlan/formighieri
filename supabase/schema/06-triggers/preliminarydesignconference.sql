-- Name: PreliminaryDesignConference preliminary_design_conference_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER preliminary_design_conference_activity_log_trg AFTER UPDATE ON public."PreliminaryDesignConference" FOR EACH ROW EXECUTE FUNCTION public.trg_preliminary_design_conference_activity_log();
