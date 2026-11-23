-- Name: MeasurementProject authenticated_delete_MedicaoProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_MedicaoProject" ON public."MeasurementProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: MeasurementProject authenticated_insert_MedicaoProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_MedicaoProject" ON public."MeasurementProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: MeasurementProject authenticated_select_MedicaoProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_MedicaoProject" ON public."MeasurementProject" FOR SELECT TO authenticated USING (true);

-- Name: MeasurementProject authenticated_update_MedicaoProject; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_MedicaoProject" ON public."MeasurementProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
