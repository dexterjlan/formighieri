-- Name: OrderDeliveryPhase order_delivery_phase_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER order_delivery_phase_activity_log_trg AFTER INSERT OR UPDATE ON public."OrderDeliveryPhase" FOR EACH ROW EXECUTE FUNCTION public.trg_order_delivery_phase_activity_log();
