-- Name: Detailing Detailing_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "Detailing_log_designer_change_insert" AFTER INSERT ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('detailing');

-- Name: Detailing Detailing_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "Detailing_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('detailing');

-- Name: Detailing detailing_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER detailing_activity_log_trg AFTER INSERT OR UPDATE ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.trg_detailing_activity_log();
