-- Name: importMarceneiroWPS authenticated_delete_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());

-- Name: importMarceneiroWPS authenticated_insert_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());

-- Name: importMarceneiroWPS authenticated_select_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR SELECT TO authenticated USING (true);

-- Name: importMarceneiroWPS authenticated_update_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());
