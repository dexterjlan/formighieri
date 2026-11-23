-- Name: OrderProject OrderProject_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "OrderProject_log_designer_change_insert" AFTER INSERT ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_designer_change();

-- Name: OrderProject OrderProject_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "OrderProject_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_designer_change();

-- Name: OrderProject OrderProject_log_status_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "OrderProject_log_status_change_insert" AFTER INSERT ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_status_change();

-- Name: OrderProject OrderProject_log_status_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "OrderProject_log_status_change_update" AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_status_change();

-- Name: OrderProject OrderProject_sync_designer_open_records; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "OrderProject_sync_designer_open_records" AFTER UPDATE OF "designerId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_order_project_designer_open_records();

-- Name: OrderProject order_project_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER order_project_activity_log_trg AFTER UPDATE ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.trg_order_project_activity_log();

-- Name: OrderProject trg_sync_aggregator_child_order_project_status; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER trg_sync_aggregator_child_order_project_status AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_aggregator_child_order_project_status();

-- Name: OrderProject trg_sync_complementar_order_project_status; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER trg_sync_complementar_order_project_status AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_complementar_order_project_status();

-- Name: OrderProject trg_sync_project_production_queue; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER trg_sync_project_production_queue AFTER INSERT OR UPDATE OF "statusId", "isComplementary", "isReplaced" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_project_production_queue();
