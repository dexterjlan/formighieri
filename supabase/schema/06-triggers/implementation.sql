-- Name: Implementation Implementation_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "Implementation_log_designer_change_insert" AFTER INSERT ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('implementation');

-- Name: Implementation Implementation_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "Implementation_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('implementation');

-- Name: Implementation implementation_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER implementation_activity_log_trg AFTER INSERT OR UPDATE ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.trg_implementation_activity_log();
