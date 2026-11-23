-- Name: AppError AppError_insert_authenticated; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "AppError_insert_authenticated" ON public."AppError" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: AppError AppError_select_admin; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "AppError_select_admin" ON public."AppError" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u.role = 'Admin'::text)))));
