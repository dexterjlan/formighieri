-- Name: Measurement measurement_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER measurement_activity_log_trg AFTER INSERT ON public."Measurement" FOR EACH ROW EXECUTE FUNCTION public.trg_measurement_activity_log();
