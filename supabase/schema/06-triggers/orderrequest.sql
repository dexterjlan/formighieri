-- Name: OrderRequest order_request_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER order_request_activity_log_trg AFTER UPDATE ON public."OrderRequest" FOR EACH ROW EXECUTE FUNCTION public.trg_order_request_activity_log();
