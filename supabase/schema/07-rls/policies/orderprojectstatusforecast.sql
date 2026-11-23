-- Name: OrderProjectStatusForecast order_project_status_forecast_authenticated_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY order_project_status_forecast_authenticated_all ON public."OrderProjectStatusForecast" TO authenticated USING (true) WITH CHECK (true);
