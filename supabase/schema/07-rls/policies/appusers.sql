-- Name: appUsers admin_update_appUsers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "admin_update_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."appUsers" admin_user
  WHERE ((admin_user."authId" = auth.uid()) AND (admin_user.role = 'Admin'::text))))) WITH CHECK (true);

-- Name: appUsers authenticated_insert_own_appUsers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_own_appUsers" ON public."appUsers" FOR INSERT TO authenticated WITH CHECK ((("authId" = auth.uid()) OR public.is_app_admin()));

-- Name: appUsers authenticated_select_appUsers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_appUsers" ON public."appUsers" FOR SELECT TO authenticated USING (true);

-- Name: appUsers authenticated_update_appUsers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((("authId" = auth.uid()) OR public.is_app_admin())) WITH CHECK ((("authId" = auth.uid()) OR public.is_app_admin()));

-- Name: appUsers authenticated_update_own_appUsers; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_own_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((auth.uid() = "authId")) WITH CHECK ((auth.uid() = "authId"));
