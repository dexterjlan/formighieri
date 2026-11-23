-- Name: salesOrders sales_order_client_delivery_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER sales_order_client_delivery_activity_log_trg AFTER UPDATE ON public."salesOrders" FOR EACH ROW EXECUTE FUNCTION public.trg_sales_order_client_delivery_activity_log();
