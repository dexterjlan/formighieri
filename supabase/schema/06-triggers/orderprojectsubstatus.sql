-- Name: OrderProjectSubstatus order_project_substatus_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER order_project_substatus_activity_log_trg AFTER INSERT OR UPDATE ON public."OrderProjectSubstatus" FOR EACH ROW EXECUTE FUNCTION public.trg_order_project_substatus_activity_log();
